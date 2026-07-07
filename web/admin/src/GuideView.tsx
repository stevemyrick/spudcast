import { useCallback, useEffect, useState } from "react";
import type { GuideGrid, ScheduledProgram } from "@spudcast/shared";
import { fmtDuration as fmtDur, fmtTime } from "@spudcast/shared";
import { api } from "./api.js";

/** How far through the "now" program we are, as a percentage. */
function wbProgress(p: ScheduledProgram): number {
  const s = new Date(p.startUtc).getTime();
  const e = new Date(p.endUtc).getTime();
  return Math.min(Math.max(((Date.now() - s) / Math.max(e - s, 1)) * 100, 0), 100);
}

/** Grid TV guide: channels down, time across. Click a program for its metadata. */
export function GuideView() {
  const [grid, setGrid] = useState<GuideGrid | null>(null);
  const [selected, setSelected] = useState<{ program: ScheduledProgram; channelName: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setGrid(await api.guideGrid(3));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to load guide");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000); // keep "now" and the loop fresh
    return () => clearInterval(t);
  }, [load]);

  if (msg) return <div className="panel"><p className="error small">{msg}</p></div>;
  if (!grid) return <div className="panel"><p className="muted">Loading guide…</p></div>;

  const startMs = new Date(grid.startUtc).getTime();
  const endMs = new Date(grid.endUtc).getTime();
  const totalMs = Math.max(endMs - startMs, 1);
  const nowPct = ((Date.now() - startMs) / totalMs) * 100;

  // Half-hour tick marks across the window.
  const ticks: { pct: number; label: string }[] = [];
  const firstTick = Math.ceil(startMs / 1_800_000) * 1_800_000;
  for (let t = firstTick; t < endMs; t += 1_800_000) {
    ticks.push({ pct: ((t - startMs) / totalMs) * 100, label: fmtTime(new Date(t).toISOString(), grid.timezone) });
  }

  return (
    <div className="panel wide">
      <div className="row">
        <h2 style={{ margin: 0 }}>TV Guide</h2>
        <span className="muted small">
          {fmtTime(grid.startUtc, grid.timezone)}–{fmtTime(grid.endUtc, grid.timezone)} · {grid.timezone}
        </span>
        <span className="spacer" />
        <button className="ghost" onClick={load}>Refresh</button>
      </div>

      {grid.channels.length === 0 ? (
        <p className="muted">No channels are on air. Toggle a channel On air to see it here.</p>
      ) : (
        <>
        {/* Now & Next wallboard */}
        <div className="wallboard">
          {grid.channels.map((row) => {
            const now = row.programs[0];
            const next = row.programs[1];
            return (
              <div className="wb-card" key={row.channel.id}>
                <div className="wb-head">
                  <span className="ch-pill">{row.channel.number}</span>
                  {row.channel.iconUrl && <img className="ch-logo sm" src={row.channel.iconUrl} alt="" />}
                  <span className="wb-name">{row.channel.name}</span>
                </div>
                {row.live ? (
                  <div className="wb-now">Weather — live</div>
                ) : now ? (
                  <>
                    <div className="wb-now" title={now.item.title}>
                      <span className="wb-label">NOW</span> {now.item.title}
                    </div>
                    <div className="wb-progress">
                      <div className="wb-progress-fill" style={{ width: `${wbProgress(now)}%` }} />
                    </div>
                    {next && (
                      <div className="wb-next" title={next.item.title}>
                        <span className="wb-label next">NEXT</span> {fmtTime(next.startUtc, grid.timezone)} · {next.item.title}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="wb-now muted">No schedule</div>
                )}
              </div>
            );
          })}
        </div>

        <div className="guide">
          {/* Time ruler */}
          <div className="guide-row ruler">
            <div className="guide-label" />
            <div className="guide-track">
              {ticks.map((tk, i) => (
                <span key={i} className="guide-tick" style={{ left: `${tk.pct}%` }}>{tk.label}</span>
              ))}
            </div>
          </div>

          {grid.channels.map((row) => (
            <div className="guide-row" key={row.channel.id}>
              <div className="guide-label">
                <span className="ch-pill">{row.channel.number}</span>
                {row.channel.iconUrl && <img className="ch-logo sm" src={row.channel.iconUrl} alt="" />}
                <span className="guide-chname">{row.channel.name}</span>
              </div>
              <div className="guide-track">
                {nowPct >= 0 && nowPct <= 100 && <div className="guide-now" style={{ left: `${nowPct}%` }} />}
                {row.live ? (
                  <button className="guide-prog live" style={{ left: 0, width: "100%" }} disabled>
                    <span className="gp-title">Weather — live</span>
                  </button>
                ) : row.programs.length === 0 ? (
                  <span className="muted small guide-empty">No schedule</span>
                ) : (
                  row.programs.map((p, i) => {
                    const ps = new Date(p.startUtc).getTime();
                    const pe = new Date(p.endUtc).getTime();
                    const left = Math.max(((ps - startMs) / totalMs) * 100, 0);
                    const right = Math.min(((pe - startMs) / totalMs) * 100, 100);
                    const width = Math.max(right - left, 0.5);
                    return (
                      <button
                        key={`${p.item.id}-${i}`}
                        className="guide-prog"
                        style={{ left: `${left}%`, width: `${width}%` }}
                        onClick={() => setSelected({ program: p, channelName: row.channel.name })}
                        title={p.item.title}
                      >
                        <span className="gp-title">{p.item.title}</span>
                        <span className="gp-time">{fmtTime(p.startUtc, grid.timezone)}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
        </>
      )}

      {selected && (
        <ProgramModal
          program={selected.program}
          channelName={selected.channelName}
          timezone={grid.timezone}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function ProgramModal({
  program,
  channelName,
  timezone,
  onClose,
}: {
  program: ScheduledProgram;
  channelName: string;
  timezone: string;
  onClose: () => void;
}) {
  const { item } = program;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h3 style={{ margin: 0 }}>{item.title}</h3>
          <span className="spacer" />
          <button className="mini" onClick={onClose}>✕</button>
        </div>
        <p className="muted small">
          {channelName} · {fmtTime(program.startUtc, timezone)}–{fmtTime(program.endUtc, timezone)}
        </p>
        <dl className="meta">
          <dt>Type</dt><dd>{item.type}</dd>
          {item.year != null && (<><dt>Year</dt><dd>{item.year}</dd></>)}
          <dt>Duration</dt><dd>{fmtDur(item.durationMs)}</dd>
          <dt>Source</dt><dd>{item.source}</dd>
          {item.genres.length > 0 && (
            <><dt>Genres</dt><dd><div className="chips">{item.genres.map((g) => <span key={g} className="chip static">{g}</span>)}</div></dd></>
          )}
          {item.tags.length > 0 && (
            <><dt>Tags</dt><dd><div className="chips">{item.tags.map((t) => <span key={t} className="chip static tag">{t}</span>)}</div></dd></>
          )}
        </dl>
      </div>
    </div>
  );
}
