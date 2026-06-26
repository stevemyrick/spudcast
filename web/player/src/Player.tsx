import { useCallback, useEffect, useRef, useState } from "react";
import type { Channel, ControlServerMessage, NowPlaying, RemoteCommand } from "@spudcast/shared";
import { controlSocketUrl, getToken, playerApi } from "./api.js";
import { Guide } from "./Guide.js";

type Phase = "loading" | "static" | "playing" | "standby";
type AspectMode = "contain" | "cover" | "fill";

const LAST_CHANNEL_KEY = "spud_last_channel";

export function Player() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [index, setIndex] = useState(0);
  const [np, setNp] = useState<NowPlaying | null>(null);
  const [streamSrc, setStreamSrc] = useState<string | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>("loading");
  const [bugVisible, setBugVisible] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [aspect, setAspect] = useState<AspectMode>("contain");
  const [muted, setMuted] = useState(false);
  const [crt, setCrt] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const bugTimer = useRef<ReturnType<typeof setTimeout>>();

  const current = channels[index];

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

  // Tune whenever the selected channel changes.
  const tune = useCallback(
    async (channel: Channel) => {
      localStorage.setItem(LAST_CHANNEL_KEY, String(channel.number));
      setPhase("static");
      flashBug();
      try {
        const playing = await playerApi.nowPlaying(channel.number);
        setNp(playing);
        // Brief static burst masks the channel change, then play.
        setTimeout(() => {
          setStreamSrc(playerApi.streamUrlForItem(playing.item));
          setPhase("playing");
        }, 550);
      } catch {
        setNp(null);
        setPhase("standby");
      }
    },
    [flashBug],
  );

  useEffect(() => {
    if (current) void tune(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Seek to the live offset once the media is ready.
  function onLoadedMetadata() {
    const v = videoRef.current;
    if (v && np) {
      const target = np.offsetMs / 1000;
      if (target > 0 && target < (v.duration || Infinity)) v.currentTime = target;
      v.play().catch(() => undefined);
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

  const changeChannel = useCallback(
    (delta: number) => {
      if (channels.length === 0) return;
      setIndex((i) => (i + delta + channels.length) % channels.length);
    },
    [channels.length],
  );

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
          const i = channels.findIndex((c) => c.number === cmd.number);
          if (i >= 0) setIndex(i);
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
      }
    },
    [changeChannel, channels],
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

  // Keep the video element's muted state in sync.
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted, streamSrc]);

  // Keyboard control (arrow/page up-down, 'g' guide, 'a' aspect).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
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
          flashBug();
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [changeChannel, flashBug]);

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

      {phase === "static" && <div className="static loud" aria-hidden />}

      {(phase === "standby" || phase === "loading") && (
        <div className="screen slate">
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

      {/* Channel bug + now-playing title */}
      {bugVisible && current && (
        <div className="bug">
          <span className="ch-num">CH {current.number}</span>
          <span className="ch-name">{current.name}</span>
          {np && <span className="ch-title">{np.item.title}</span>}
        </div>
      )}

      {showGuide && current && (
        <Guide
          channels={channels}
          currentNumber={current.number}
          roomCode={roomCode}
          onClose={() => setShowGuide(false)}
        />
      )}

      {muted && <div className="mute-badge">MUTED</div>}

      {/* Optional CRT scanline/vignette shader overlay (toggle: S key / remote). */}
      {crt && <div className="crt" aria-hidden />}
    </div>
  );
}
