import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Channel,
  ControlServerMessage,
  NowPlaying,
  RemoteCommand,
  ScheduledProgram,
  WeatherConfig,
} from "@spudcast/shared";
import { controlSocketUrl, getToken, playerApi } from "./api.js";
import { Guide } from "./Guide.js";
import { InfoBanner, Clock } from "./InfoBanner.js";
import { PinPrompt } from "./PinPrompt.js";
import { ColorBars } from "./ColorBars.js";
import { playChannelChange, startHiss, stopHiss } from "./retro.js";
import { WeatherView } from "./WeatherView.js";

type Phase = "loading" | "static" | "playing" | "standby" | "weather";
type AspectMode = "contain" | "cover" | "fill";

const LAST_CHANNEL_KEY = "spud_last_channel";
const FAVORITES_KEY = "spud_favorites";
const RETRO_KEY = "spud_retro";

function loadFavorites(): Set<number> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]") as number[]);
  } catch {
    return new Set();
  }
}

export function Player() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [index, setIndex] = useState(0);
  const [np, setNp] = useState<NowPlaying | null>(null);
  const [weather, setWeather] = useState<WeatherConfig | null>(null);
  const [streamSrc, setStreamSrc] = useState<string | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>("loading");
  const [bugVisible, setBugVisible] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [aspect, setAspect] = useState<AspectMode>("contain");
  const [muted, setMuted] = useState(false);
  const [crt, setCrt] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  // True when the browser blocked autoplay-with-sound and we fell back to muted
  // playback; cleared (and sound restored) on the first user interaction.
  const [autoMuted, setAutoMuted] = useState(false);
  // Display timezone for the on-screen clock + program times (from /api/tv/config).
  const [timezone, setTimezone] = useState<string | undefined>(undefined);
  // Info banner ("what's on" card) + the next scheduled program for it.
  const [showInfo, setShowInfo] = useState(false);
  const [upNext, setUpNext] = useState<ScheduledProgram | null>(null);
  // Favorite channels (persisted) + favorites-only surfing.
  const [favorites, setFavorites] = useState<Set<number>>(loadFavorites);
  const [favOnly, setFavOnly] = useState(false);
  // Parental lock: once the PIN is entered it unlocks locked channels for the session.
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [pinPrompt, setPinPrompt] = useState(false);
  // Retro "delight pack": channel-change chime + color-bars/hiss dead-channel slate.
  const [retro, setRetro] = useState(() => localStorage.getItem(RETRO_KEY) !== "off");
  const videoRef = useRef<HTMLVideoElement>(null);
  const bugTimer = useRef<ReturnType<typeof setTimeout>>();
  const infoTimer = useRef<ReturnType<typeof setTimeout>>();
  // Index of the previously-tuned channel, for the "Last" recall button.
  const prevIndexRef = useRef<number | null>(null);

  const current = channels[index];

  // Fetch display config (timezone) once at startup.
  useEffect(() => {
    playerApi.tvConfig().then((c) => setTimezone(c.timezone)).catch(() => undefined);
  }, []);

  // Load the on-air lineup once.
  useEffect(() => {
    playerApi
      .channels()
      .then((list) => {
        setChannels(list);
        if (list.length === 0) {
          setPhase("standby");
          return;
        }
        const last = Number(localStorage.getItem(LAST_CHANNEL_KEY));
        const startIdx = Math.max(0, list.findIndex((c) => c.number === last));
        setIndex(startIdx === -1 ? 0 : startIdx);
      })
      .catch(() => setPhase("standby"));
  }, []);

  const flashBug = useCallback(() => {
    setBugVisible(true);
    clearTimeout(bugTimer.current);
    bugTimer.current = setTimeout(() => setBugVisible(false), 4000);
  }, []);

  // Auto-show the info card briefly (on tune); it can be pinned via Info.
  const flashInfo = useCallback(() => {
    setShowInfo(true);
    clearTimeout(infoTimer.current);
    infoTimer.current = setTimeout(() => setShowInfo(false), 6000);
  }, []);

  // Toggle the info card and pin it (no auto-hide) when opened via Info.
  const toggleInfo = useCallback(() => {
    clearTimeout(infoTimer.current);
    setShowInfo((s) => !s);
  }, []);

  // Tune whenever the selected channel changes.
  const tune = useCallback(
    async (channel: Channel) => {
      // Locked channel with no PIN entered yet → prompt instead of playing.
      if (channel.locked && !pinUnlocked) {
        setStreamSrc(undefined);
        setWeather(null);
        setPinPrompt(true);
        setPhase("standby");
        return;
      }
      localStorage.setItem(LAST_CHANNEL_KEY, String(channel.number));
      setPhase("static");
      flashBug();
      try {
        const playing = await playerApi.nowPlaying(channel.number);
        setNp(playing);
        // Fetch the next program for the info card's "Up next" (best-effort).
        if (playing.kind === "program") {
          playerApi.guide(channel.number, 2).then((g) => setUpNext(g[1] ?? null)).catch(() => setUpNext(null));
        } else {
          setUpNext(null);
        }
        // Brief static burst masks the channel change, then show the content.
        setTimeout(() => {
          if (playing.kind === "weather") {
            setWeather(playing.weather);
            setStreamSrc(undefined);
            setPhase("weather");
          } else {
            setWeather(null);
            const offset = playing.kind === "program" ? playing.offsetMs : 0;
            setStreamSrc(playerApi.streamUrlForItem(playing.item, offset));
            setPhase("playing");
            flashInfo();
          }
        }, 550);
      } catch {
        setNp(null);
        setWeather(null);
        setPhase("standby");
      }
    },
    [flashBug, flashInfo, pinUnlocked],
  );

  // Verify an entered PIN; on success unlock locked channels for the session.
  const attemptPin = useCallback(async (pin: string): Promise<boolean> => {
    const ok = await playerApi.verifyPin(pin).catch(() => false);
    if (ok) {
      setPinUnlocked(true);
      setPinPrompt(false);
    }
    return ok;
  }, []);

  useEffect(() => {
    if (current) void tune(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Once the PIN unlocks, tune into the locked channel we were held on.
  useEffect(() => {
    if (pinUnlocked && current?.locked) void tune(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinUnlocked]);

  // Start playback once the media is ready. Local files are direct-play and
  // seekable, so we jump to the live offset client-side; Jellyfin streams are
  // transcoded with the offset already baked in (not seekable), so we just play.
  function onLoadedMetadata() {
    const v = videoRef.current;
    if (v && np && np.kind === "program") {
      if (np.item.source === "local") {
        const target = np.offsetMs / 1000;
        if (target > 0 && target < (v.duration || Infinity)) v.currentTime = target;
      }
      v.play().catch(() => {
        // Browser blocked autoplay with sound (no kiosk flag / no user gesture):
        // play muted so the picture runs, and restore sound on first interaction.
        v.muted = true;
        setAutoMuted(true);
        v.play().catch(() => undefined);
      });
    }
  }

  // When the current item ends, re-fetch now-playing (the schedule has advanced).
  function onEnded() {
    if (current) void tune(current);
  }

  function onError() {
    // Missing/broken stream: show the slate, then retry shortly (skips ahead).
    setPhase("standby");
    setTimeout(() => current && void tune(current), 4000);
  }

  // Tune to an index, remembering the current one for "Last" recall.
  const goToIndex = useCallback(
    (next: number) => {
      if (next < 0 || next >= channels.length) return;
      if (next !== index) {
        prevIndexRef.current = index;
        if (retro) playChannelChange();
      }
      setIndex(next);
    },
    [channels.length, index, retro],
  );

  const changeChannel = useCallback(
    (delta: number) => {
      if (channels.length === 0) return;
      // Surfable channels: skip locked ones (until the PIN unlocks the session)
      // so kids can't stumble into them; in favorites-only mode, only stars.
      let surfable = channels
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => pinUnlocked || !c.locked);
      if (favOnly && surfable.some(({ c }) => favorites.has(c.number))) {
        surfable = surfable.filter(({ c }) => favorites.has(c.number));
      }
      const list = surfable.length > 0 ? surfable.map((x) => x.i) : channels.map((_, i) => i);
      const pos = list.indexOf(index);
      const nextPos = pos === -1 ? 0 : (pos + delta + list.length) % list.length;
      goToIndex(list[nextPos]);
    },
    [channels, favorites, favOnly, index, goToIndex, pinUnlocked],
  );

  // Persist favorites whenever they change.
  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  }, [favorites]);

  // Persist the retro toggle; stop any hiss when it's turned off.
  useEffect(() => {
    localStorage.setItem(RETRO_KEY, retro ? "on" : "off");
    if (!retro) stopHiss();
  }, [retro]);

  // Dead-channel hiss: play a low static loop while the standby slate shows.
  useEffect(() => {
    const dead = retro && phase === "standby" && !pinPrompt;
    if (dead) startHiss();
    else stopHiss();
    return () => stopHiss();
  }, [retro, phase, pinPrompt]);

  const toggleFavorite = useCallback(() => {
    if (!current) return;
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(current.number)) next.delete(current.number);
      else next.add(current.number);
      return next;
    });
    flashBug();
  }, [current, flashBug]);

  const recallLast = useCallback(() => {
    if (prevIndexRef.current != null) goToIndex(prevIndexRef.current);
  }, [goToIndex]);

  // Apply a remote-control command. Held in a ref so the WS handler always sees
  // the latest version without re-subscribing.
  const applyCommand = useCallback(
    (cmd: RemoteCommand) => {
      switch (cmd.action) {
        case "channel_up":
          changeChannel(1);
          break;
        case "channel_down":
          changeChannel(-1);
          break;
        case "set_channel": {
          // While the PIN prompt is up, the remote keypad enters the PIN instead.
          if (pinPrompt) {
            if (cmd.number != null) void attemptPin(String(cmd.number));
            break;
          }
          const i = channels.findIndex((c) => c.number === cmd.number);
          if (i >= 0) goToIndex(i);
          break;
        }
        case "toggle_guide":
          setShowGuide((s) => !s);
          break;
        case "toggle_mute":
          setMuted((m) => !m);
          break;
        case "toggle_crt":
          setCrt((c) => !c);
          break;
        case "toggle_info":
          toggleInfo();
          break;
        case "last_channel":
          recallLast();
          break;
        case "toggle_favorite":
          toggleFavorite();
          break;
        case "favorites_only":
          setFavOnly((f) => !f);
          break;
      }
    },
    [changeChannel, channels, goToIndex, toggleInfo, recallLast, toggleFavorite, pinPrompt, attemptPin],
  );
  const applyRef = useRef(applyCommand);
  applyRef.current = applyCommand;

  // Connect to the control socket so a paired phone remote can drive this TV.
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const ws = new WebSocket(controlSocketUrl());
    ws.onopen = () => ws.send(JSON.stringify({ role: "tv", token }));
    ws.onmessage = (ev) => {
      let msg: ControlServerMessage;
      try {
        msg = JSON.parse(ev.data) as ControlServerMessage;
      } catch {
        return;
      }
      if (msg.type === "room") setRoomCode(msg.code);
      else if (msg.type === "command") applyRef.current(msg);
    };
    return () => ws.close();
  }, []);

  // Keep the video element's muted state in sync. While autoMuted (autoplay
  // fallback), stay muted regardless of the user's mute preference.
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted || autoMuted;
  }, [muted, autoMuted, streamSrc]);

  // Restore sound on the first user interaction after an autoplay-muted fallback.
  useEffect(() => {
    if (!autoMuted) return;
    const restore = () => setAutoMuted(false);
    window.addEventListener("pointerdown", restore, { once: true });
    window.addEventListener("keydown", restore, { once: true });
    return () => {
      window.removeEventListener("pointerdown", restore);
      window.removeEventListener("keydown", restore);
    };
  }, [autoMuted]);

  // Keyboard control (arrow/page up-down, 'g' guide, 'a' aspect).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (pinPrompt) return; // PinPrompt owns the keyboard while it's open
      switch (e.key) {
        case "ArrowUp":
        case "PageUp":
          changeChannel(1);
          break;
        case "ArrowDown":
        case "PageDown":
          changeChannel(-1);
          break;
        case "g":
        case "G":
          setShowGuide((s) => !s);
          break;
        case "a":
        case "A":
          setAspect((m) => (m === "contain" ? "cover" : m === "cover" ? "fill" : "contain"));
          break;
        case "s":
        case "S":
          setCrt((c) => !c);
          break;
        case "i":
        case "I":
          toggleInfo();
          break;
        case "f":
        case "F":
          toggleFavorite();
          break;
        case "l":
        case "L":
          recallLast();
          break;
        case "r":
        case "R":
          setRetro((v) => !v);
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [changeChannel, toggleInfo, toggleFavorite, recallLast, pinPrompt]);

  return (
    <div className="tv">
      <video
        ref={videoRef}
        className="video"
        src={streamSrc}
        style={{ objectFit: aspect, opacity: phase === "playing" ? 1 : 0 }}
        autoPlay
        playsInline
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
        onError={onError}
      />

      {phase === "weather" && weather && <WeatherView config={weather} muted={muted} />}

      {phase === "static" && <div className="static loud" aria-hidden />}

      {(phase === "standby" || phase === "loading") && !pinPrompt && (
        <div className="screen slate">
          {retro && phase === "standby" && <ColorBars />}
          <h1 className="brand">spudcast</h1>
          <p className="status">
            {phase === "loading"
              ? "Tuning…"
              : channels.length === 0
                ? "No channels on air"
                : "Please stand by"}
          </p>
        </div>
      )}

      {/* Persistent clock (top corner) */}
      <Clock timezone={timezone} />

      {/* Channel bug + now-playing title */}
      {bugVisible && current && (
        <div className="bug">
          {current.iconUrl && <img className="bug-logo" src={current.iconUrl} alt="" />}
          <span className="ch-num">
            CH {current.number}
            {favorites.has(current.number) && <span className="fav-star" title="Favorite"> ★</span>}
          </span>
          <span className="ch-name">{current.name}</span>
          {np && (
            <span className="ch-title">{np.kind === "weather" ? "Weather" : np.item.title}</span>
          )}
        </div>
      )}

      {favOnly && <div className="fav-badge">★ FAVORITES</div>}

      {pinPrompt && current && (
        <PinPrompt
          channelName={`CH ${current.number} · ${current.name}`}
          onVerify={attemptPin}
          onCancel={() => { setPinPrompt(false); recallLast(); }}
        />
      )}

      {/* "What's on" info card (on tune, or pinned via Info) */}
      {showInfo && current && np && np.kind === "program" && (
        <InfoBanner channel={current} np={np} upNext={upNext} timezone={timezone} roomCode={roomCode} />
      )}

      {showGuide && current && (
        <Guide
          channels={channels}
          currentNumber={current.number}
          roomCode={roomCode}
          timezone={timezone}
          onClose={() => setShowGuide(false)}
        />
      )}

      {muted && <div className="mute-badge">MUTED</div>}

      {/* Optional CRT scanline/vignette shader overlay (toggle: S key / remote). */}
      {crt && <div className="crt" aria-hidden />}
    </div>
  );
}
