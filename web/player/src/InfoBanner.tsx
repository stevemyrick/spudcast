import { useEffect, useState } from "react";
import type { Channel, ProgramNowPlaying, ScheduledProgram } from "@spudcast/shared";
import { fmtClock, fmtTime } from "@spudcast/shared";
import { QrCode } from "./QrCode.js";

/** Persistent on-screen clock in the configured timezone (ticks each second). */
export function Clock({ timezone }: { timezone?: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <div className="tv-clock">{fmtClock(now, timezone)}</div>;
}

/**
 * "What's on" info card: channel, program title, rating, description, a live
 * progress bar, air times, and up-next — the cable-box banner on tune / Info.
 */
export function InfoBanner({
  channel,
  np,
  upNext,
  timezone,
  roomCode,
}: {
  channel: Channel;
  np: ProgramNowPlaying;
  upNext: ScheduledProgram | null;
  timezone?: string;
  roomCode?: string | null;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const endMs = new Date(np.endsAt).getTime();
  const startMs = endMs - np.item.durationMs;
  const progress = Math.min(Math.max((nowMs - startMs) / Math.max(endMs - startMs, 1), 0), 1);

  return (
    <div className="info-banner">
      <div className="info-main">
        <div className="info-head">
          <span className="ch-num">CH {channel.number}</span>
          <span className="ch-name">{channel.name}</span>
          <span className="info-times">
            {fmtTime(new Date(startMs).toISOString(), timezone)}–{fmtTime(np.endsAt, timezone)}
          </span>
        </div>
        <div className="info-title-row">
          <h2 className="info-title">{np.item.title}</h2>
          {np.item.rating && <span className="rating-badge">{np.item.rating}</span>}
          {np.item.year != null && <span className="info-year">{np.item.year}</span>}
        </div>
        <div className="info-progress"><div className="info-progress-fill" style={{ width: `${progress * 100}%` }} /></div>
        {np.item.overview && <p className="info-overview">{np.item.overview}</p>}
        {upNext && (
          <p className="info-next">
            <span className="info-next-label">Up next</span>
            {fmtTime(upNext.startUtc, timezone)} · {upNext.item.title}
          </p>
        )}
      </div>

      {roomCode && (
        <div className="info-pair">
          <QrCode value={`${location.origin}/tv/remote?room=${roomCode}`} size={92} />
          <div className="info-pair-text">
            <div className="info-pair-title">📱 Phone remote</div>
            <div className="info-pair-code">{roomCode}</div>
            <div className="info-pair-hint">scan, or /tv/remote</div>
          </div>
        </div>
      )}
    </div>
  );
}
