import { useEffect, useRef } from "react";
import type { WeatherConfig } from "@spudcast/shared";
import { playerApi } from "./api.js";

/** Extract a YouTube video id from a watch/share/embed URL. */
function youtubeId(url: string): string | null {
  const m =
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/.exec(url) ??
    /[?&]v=([\w-]{11})/.exec(url);
  return m ? m[1] : null;
}

/**
 * The always-live weather channel: a full-screen WeatherStar (ws4kp) embed with
 * the user's chosen background audio underneath (a Jellyfin track or a YouTube
 * URL). ws4kp's own audio is irrelevant — we only show its visuals.
 */
export function WeatherView({ config, muted }: { config: WeatherConfig; muted: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const audio = config.audio;
  const ytId = audio?.kind === "youtube" && audio.value ? youtubeId(audio.value) : null;

  // Keep the Jellyfin audio element's mute in sync and (re)start it.
  useEffect(() => {
    const a = audioRef.current;
    if (a) {
      a.muted = muted;
      a.play().catch(() => undefined);
    }
  }, [muted, audio?.value]);

  return (
    <div className="weather">
      <iframe
        className="weather-frame"
        title="Weather"
        src={config.embedUrl}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        allow="autoplay; fullscreen"
      />

      {/* Background audio bed (hidden). */}
      {audio?.kind === "jellyfin" && audio.value && (
        <audio ref={audioRef} src={playerApi.audioUrl(audio.value)} autoPlay loop />
      )}
      {audio?.kind === "youtube" && ytId && !muted && (
        <iframe
          className="weather-audio"
          title="Weather audio"
          src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&loop=1&playlist=${ytId}&controls=0`}
          allow="autoplay"
        />
      )}
    </div>
  );
}
