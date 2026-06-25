import { useEffect, useState } from "react";
import type { Channel, ScheduledProgram } from "@spudcast/shared";
import { playerApi } from "./api.js";

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** On-screen "what's on now / next" guide overlay across the on-air lineup. */
export function Guide({
  channels,
  currentNumber,
  onClose,
}: {
  channels: Channel[];
  currentNumber: number;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Record<number, ScheduledProgram[]>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all(channels.map((c) => playerApi.guide(c.number, 3).then((g) => [c.number, g] as const)))
      .then((entries) => {
        if (!cancelled) setRows(Object.fromEntries(entries));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [channels]);

  return (
    <div className="guide" onClick={onClose}>
      <div className="guide-head">TV GUIDE</div>
      <div className="guide-rows">
        {channels.map((c) => {
          const progs = rows[c.number] ?? [];
          return (
            <div key={c.number} className={c.number === currentNumber ? "guide-row active" : "guide-row"}>
              <div className="guide-ch">
                <span className="guide-num">{c.number}</span>
                <span className="guide-name">{c.name}</span>
              </div>
              <div className="guide-progs">
                {progs.map((p, i) => (
                  <span key={i} className={i === 0 ? "prog now" : "prog"}>
                    <span className="prog-time">{hhmm(p.startUtc)}</span> {p.item.title}
                  </span>
                ))}
                {progs.length === 0 && <span className="prog muted">—</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="guide-foot">Press G to close</div>
    </div>
  );
}
