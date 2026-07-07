import { useCallback, useEffect, useState } from "react";
import type { AutoRules, Channel, ChannelSchedule, LibraryItem, SessionInfo } from "@spudcast/shared";
import type { WeatherConfig } from "@spudcast/shared";
import { fmtDuration as fmtDur, fmtTime } from "@spudcast/shared";
import { api, readDurationMs } from "./api.js";
import { AutoChannelWizard } from "./AutoChannelWizard.js";
import { WeatherChannelWizard, WeatherFields } from "./WeatherChannel.js";

/**
 * On-air program schedule for a channel: each program's start/end wall-clock
 * time for the loop pass airing now. Re-fetches when the lineup changes
 * (`version`) and every 20s so it tracks the loop restarting.
 */
function OnAirSchedule({ channelId, version }: { channelId: number; version: number }) {
  const [data, setData] = useState<ChannelSchedule | null>(null);
  const nowMs = Date.now();

  useEffect(() => {
    let cancelled = false;
    const fetchIt = () =>
      api.channelSchedule(channelId).then((d) => { if (!cancelled) setData(d); }).catch(() => undefined);
    fetchIt();
    const t = setInterval(fetchIt, 20_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [channelId, version]);

  if (!data || data.programs.length === 0) return null;
  return (
    <div className="schedule">
      <h3>On-air schedule <span className="muted small">· times in {data.timezone}</span></h3>
      <div className="list">
        {data.programs.map((p, i) => {
          const airing = new Date(p.startUtc).getTime() <= nowMs && nowMs < new Date(p.endUtc).getTime();
          return (
            <div className={airing ? "list-item airing" : "list-item"} key={`${p.item.id}-${i}`}>
              <span className="sched-time">{fmtTime(p.startUtc, data.timezone)}–{fmtTime(p.endUtc, data.timezone)}</span>
              {airing && <span className="badge on">NOW</span>}
              <span className="title">{p.item.title}</span>
              <span className="spacer" />
              <span className="muted small">{fmtDur(p.item.durationMs)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Channel Creator: list/create channels and edit a channel's playlist. */
export function ChannelsView({ session }: { session: SessionInfo }) {
  const isAdmin = session.user?.role === "admin";
  const myId = session.user?.id;
  const [channels, setChannels] = useState<Channel[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [wizard, setWizard] = useState(false);
  const [weatherWizard, setWeatherWizard] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newName, setNewName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  // channel number -> what's on right now (for on-air channels).
  const [nowPlaying, setNowPlaying] = useState<Record<number, string>>({});

  const loadChannels = useCallback(async () => {
    const all = await api.channels(true);
    const mine = all.filter((c) => isAdmin || c.ownerId === myId);
    setChannels(mine);
    // Fetch what's currently airing on each live channel (best-effort).
    const live = await Promise.all(
      mine
        .filter((c) => c.onAir)
        .map(async (c) => {
          try {
            const np = await api.nowPlaying(c.number);
            const label = np.kind === "weather" ? "Weather" : np.item.title;
            return [c.number, label] as const;
          } catch {
            return [c.number, ""] as const;
          }
        }),
    );
    setNowPlaying(Object.fromEntries(live.filter(([, label]) => label)));
  }, [isAdmin, myId]);

  useEffect(() => {
    loadChannels().catch(() => undefined);
    // Keep "now playing" fresh as the schedule advances.
    const t = setInterval(() => loadChannels().catch(() => undefined), 20_000);
    return () => clearInterval(t);
  }, [loadChannels]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const ch = await api.createChannel({ number: Number(newNumber), name: newName });
      setNewNumber("");
      setNewName("");
      await loadChannels();
      setEditingId(ch.id);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Create failed");
    }
  }

  if (editingId != null) {
    return (
      <ChannelEditor
        channelId={editingId}
        onBack={() => {
          setEditingId(null);
          loadChannels();
        }}
      />
    );
  }

  if (wizard) {
    return (
      <AutoChannelWizard
        onCancel={() => setWizard(false)}
        onCreated={() => {
          setWizard(false);
          loadChannels();
        }}
      />
    );
  }

  if (weatherWizard) {
    return (
      <WeatherChannelWizard
        onCancel={() => setWeatherWizard(false)}
        onCreated={() => {
          setWeatherWizard(false);
          loadChannels();
        }}
      />
    );
  }

  return (
    <div className="panel">
      <div className="row">
        <h2 style={{ margin: 0 }}>Channels</h2>
        <span className="spacer" />
        <button className="ghost" onClick={() => setWeatherWizard(true)}>🌤 Weather</button>
        <button className="ghost" onClick={() => setWizard(true)}>✨ Auto channel</button>
      </div>
      <form className="row" onSubmit={create}>
        <input placeholder="#" value={newNumber} onChange={(e) => setNewNumber(e.target.value)} style={{ width: 70 }} required />
        <input placeholder="New manual channel name" className="grow" value={newName} onChange={(e) => setNewName(e.target.value)} required />
        <button type="submit">Create</button>
      </form>
      {msg && <p className="error small">{msg}</p>}

      <div className="list">
        {channels.map((c) => (
          <div className="list-item" key={c.id}>
            <span className="ch-pill">{c.number}</span>
            <div className="grow">
              <span className="title">{c.name}</span>
              {c.onAir && nowPlaying[c.number] && (
                <div className="muted small">▶ Now playing: {nowPlaying[c.number]}</div>
              )}
            </div>
            {c.type !== "manual" && <span className="badge">{c.type}</span>}
            {c.onAir ? <span className="badge on">ON AIR</span> : <span className="badge">off air</span>}
            <span className="spacer" />
            <button className="ghost" onClick={() => setEditingId(c.id)}>Edit</button>
          </div>
        ))}
        {channels.length === 0 && (
          <div className="empty-hint">
            <p className="muted">No channels yet. Getting started:</p>
            <ol className="muted small">
              <li><b>Library</b> → connect Jellyfin in Settings, then <b>Refresh library</b>.</li>
              <li>Create a channel above, or <b>✨ Auto channel</b> by genre/decade.</li>
              <li>Toggle it <b>On air</b>, then open <code>/tv</code> on your TV and pair it.</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

function ChannelEditor({ channelId, onBack }: { channelId: number; onBack: () => void }) {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Bumped after a lineup change so the on-air schedule re-fetches immediately.
  const [scheduleVersion, setScheduleVersion] = useState(0);

  const load = useCallback(async () => {
    const { channel, items } = await api.channel(channelId);
    setChannel(channel);
    setItems(items);
    setDirty(false);
  }, [channelId]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  if (!channel) return <div className="panel"><p className="muted">Loading…</p></div>;

  function move(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
    setDirty(true);
  }
  function remove(i: number) {
    setItems(items.filter((_, k) => k !== i));
    setDirty(true);
  }
  function add(item: LibraryItem) {
    setItems([...items, item]);
    setDirty(true);
  }

  async function savePlaylist() {
    await api.setChannelItems(channel!.id, items.map((it) => it.id));
    setDirty(false);
    setMsg("Playlist saved.");
    setScheduleVersion((v) => v + 1);
  }
  async function toggleOnAir() {
    const updated = await api.updateChannel(channel!.id, { onAir: !channel!.onAir });
    setChannel(updated);
  }
  async function toggleLocked() {
    const updated = await api.updateChannel(channel!.id, { locked: !channel!.locked });
    setChannel(updated);
  }
  async function saveLogo(iconUrl: string) {
    const updated = await api.updateChannel(channel!.id, { iconUrl: iconUrl || null });
    setChannel(updated);
  }
  async function rename(name: string) {
    const updated = await api.updateChannel(channel!.id, { name });
    setChannel(updated);
  }
  async function del() {
    if (!confirm(`Delete channel ${channel!.number} “${channel!.name}”?`)) return;
    await api.deleteChannel(channel!.id);
    onBack();
  }

  const totalMs = items.reduce((s, it) => s + it.durationMs, 0);
  const isAuto = channel.type === "auto";
  const isWeather = channel.type === "weather";

  async function saveWeather(weather: WeatherConfig) {
    const updated = await api.updateChannel(channel!.id, { config: { weather } });
    setChannel(updated);
  }

  return (
    <div className="panel wide">
      <div className="row">
        <button className="ghost" onClick={onBack}>← Channels</button>
        <span className="ch-pill">{channel.number}</span>
        <input value={channel.name} onChange={(e) => setChannel({ ...channel, name: e.target.value })} onBlur={(e) => rename(e.target.value)} className="grow" />
        {channel.type !== "manual" && <span className="badge">{channel.type}</span>}
        <button className={channel.onAir ? "" : "ghost"} onClick={toggleOnAir}>
          {channel.onAir ? "On air" : "Off air"}
        </button>
        <button
          className={channel.locked ? "" : "ghost"}
          onClick={toggleLocked}
          title="Require the station PIN to tune to this channel on the TV"
        >
          {channel.locked ? "🔒 Locked" : "🔓 Unlocked"}
        </button>
        <button className="ghost danger" onClick={del}>Delete</button>
      </div>

      <div className="row logo-row">
        {channel.iconUrl && <img className="ch-logo" src={channel.iconUrl} alt="" />}
        <input
          className="grow"
          placeholder="Channel logo image URL (optional)"
          defaultValue={channel.iconUrl ?? ""}
          onBlur={(e) => saveLogo(e.target.value.trim())}
        />
      </div>

      {!isWeather && <FillerControls channel={channel} onChange={setChannel} />}

      {channel.onAir && !isWeather && (
        <OnAirSchedule channelId={channel.id} version={scheduleVersion} />
      )}

      {isWeather ? (
        <WeatherEditor channel={channel} onSave={saveWeather} />
      ) : isAuto ? (
        // Remount on reload so a freshly-resolved lineup (e.g. after raising the
        // limit) replaces the editor's seeded state.
        <AutoLineupEditor
          key={`${channel.id}:${items.length}:${JSON.stringify(channel.rules)}`}
          channel={channel}
          items={items}
          onSaved={async () => { await load(); setScheduleVersion((v) => v + 1); }}
        />
      ) : (
        <div className="two-col">
          <div>
            <h3>Playlist · {items.length} items · {fmtDur(totalMs)} loop</h3>
            <div className="list">
              {items.map((it, i) => (
                <div className="list-item" key={`${it.id}-${i}`}>
                  <span className="ord">{i + 1}</span>
                  <span className="title">{it.title}</span>
                  <span className="spacer" />
                  <span className="muted small">{fmtDur(it.durationMs)}</span>
                  <button className="mini" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                  <button className="mini" onClick={() => move(i, 1)} disabled={i === items.length - 1}>↓</button>
                  <button className="mini" onClick={() => remove(i)}>✕</button>
                </div>
              ))}
              {items.length === 0 && <p className="muted">Empty. Add programs from the library →</p>}
            </div>
            <div className="row">
              <button onClick={savePlaylist} disabled={!dirty}>{dirty ? "Save playlist" : "Saved"}</button>
              {msg && <span className="muted small">{msg}</span>}
            </div>
          </div>

          <LibraryPicker onAdd={add} onUploaded={add} />
        </div>
      )}
    </div>
  );
}

/**
 * Auto-channel lineup editor. Auto channels resolve their programs live from
 * rules, so edits are stored as an overlay: `order` pins the sequence, `excludeIds`
 * removes items, and `limit` caps how many matching programs play. New matching
 * content still flows in automatically — appended after pinned items, minus removals.
 */
function AutoLineupEditor({
  channel,
  items: initial,
  onSaved,
}: {
  channel: Channel;
  items: LibraryItem[];
  onSaved: () => Promise<void> | void;
}) {
  const rules = (channel.rules ?? {}) as AutoRules;
  const [items, setItems] = useState<LibraryItem[]>(initial);
  const [excluded, setExcluded] = useState<number[]>(rules.excludeIds ?? []);
  const [limit, setLimit] = useState<number>(rules.limit ?? 100);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function remove(i: number) {
    const it = items[i];
    setItems(items.filter((_, k) => k !== i));
    setExcluded((ex) => (ex.includes(it.id) ? ex : [...ex, it.id]));
    setDirty(true);
  }

  function onDrop(target: number) {
    if (dragIndex === null || dragIndex === target) return;
    const next = items.slice();
    const [moved] = next.splice(dragIndex, 1);
    next.splice(target, 0, moved);
    setItems(next);
    setDragIndex(null);
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await api.updateChannel(channel.id, {
        rules: { ...rules, order: items.map((it) => it.id), excludeIds: excluded, limit },
      });
      setDirty(false);
      setMsg("Lineup saved.");
      await onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const totalMs = items.reduce((s, it) => s + it.durationMs, 0);

  return (
    <div>
      <h3>Auto lineup · {items.length} programs · {fmtDur(totalMs)} loop</h3>
      <p className="muted small">
        Chosen automatically from this channel’s rules and refreshed as your library grows.
        Drag to reorder, ✕ to remove; new matching content still flows in.
      </p>
      <div className="row">
        <label className="muted small">
          Max episodes:&nbsp;
          <input
            type="number"
            min={1}
            max={2000}
            value={limit}
            onChange={(e) => { setLimit(Math.max(1, Math.min(2000, Number(e.target.value) || 1))); setDirty(true); }}
            style={{ width: 80 }}
          />
        </label>
      </div>
      <div className="list tall">
        {items.map((it, i) => (
          <div
            className={dragIndex === i ? "list-item dragging" : "list-item"}
            key={`${it.id}-${i}`}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(i)}
            onDragEnd={() => setDragIndex(null)}
          >
            <span className="drag-handle" title="Drag to reorder">⋮⋮</span>
            <span className="ord">{i + 1}</span>
            <span className="title">{it.title}</span>
            <span className="spacer" />
            <span className="muted small">{it.year ?? ""}</span>
            <span className="muted small">{fmtDur(it.durationMs)}</span>
            <button className="mini" onClick={() => remove(i)} title="Remove from lineup">✕</button>
          </div>
        ))}
        {items.length === 0 && <p className="muted">No matching programs yet.</p>}
      </div>
      <div className="row">
        <button onClick={save} disabled={!dirty || saving}>{saving ? "Saving…" : dirty ? "Save lineup" : "Saved"}</button>
        {msg && <span className="muted small">{msg}</span>}
      </div>
    </div>
  );
}

/** Edit a weather channel's WeatherStar URL + background audio. */
function WeatherEditor({ channel, onSave }: { channel: Channel; onSave: (c: WeatherConfig) => Promise<void> }) {
  const initial = ((channel.config as { weather?: WeatherConfig } | null)?.weather) ?? {
    embedUrl: "https://weatherstar.netbymatt.com",
    audio: { kind: "none" as const },
  };
  const [config, setConfig] = useState<WeatherConfig>(initial);
  const [saved, setSaved] = useState(false);

  async function save() {
    await onSave(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="stack">
      <p className="muted small">Always-live weather channel. ws4kp visuals with your own audio bed.</p>
      <WeatherFields value={config} onChange={(c) => { setConfig(c); setSaved(false); }} />
      <div className="row">
        <button onClick={save} disabled={!config.embedUrl}>{saved ? "Saved" : "Save weather settings"}</button>
      </div>
    </div>
  );
}

/** Toggle retro commercial breaks between programs, drawn from the commercial/bumper pool. */
function FillerControls({ channel, onChange }: { channel: Channel; onChange: (c: Channel) => void }) {
  const filler = (channel.config as { filler?: { enabled: boolean; perBreak: number } } | null)?.filler;
  const [enabled, setEnabled] = useState(Boolean(filler?.enabled));
  const [perBreak, setPerBreak] = useState(filler?.perBreak ?? 1);
  const [poolCount, setPoolCount] = useState<number | null>(null);

  useEffect(() => {
    api
      .previewRules({ types: ["commercial", "bumper"], limit: 2000 })
      .then((r) => setPoolCount(r.count))
      .catch(() => setPoolCount(null));
  }, []);

  async function save(nextEnabled: boolean, nextPerBreak: number) {
    setEnabled(nextEnabled);
    setPerBreak(nextPerBreak);
    const updated = await api.updateChannel(channel.id, {
      config: { ...(channel.config as object), filler: { enabled: nextEnabled, perBreak: nextPerBreak } },
    });
    onChange(updated);
  }

  return (
    <div className="filler-bar">
      <label className="check">
        <input type="checkbox" checked={enabled} onChange={(e) => save(e.target.checked, perBreak)} />
        Commercial breaks
      </label>
      {enabled && (
        <label className="muted small">
          clips between programs:&nbsp;
          <input
            type="number"
            min={1}
            max={10}
            value={perBreak}
            onChange={(e) => save(true, Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
            style={{ width: 56 }}
          />
        </label>
      )}
      <span className="spacer" />
      <span className="muted small">
        {poolCount === null
          ? ""
          : poolCount === 0
            ? "No commercials/bumpers uploaded yet — add some in the library."
            : `${poolCount} clip${poolCount === 1 ? "" : "s"} in the commercial pool`}
      </span>
    </div>
  );
}

function LibraryPicker({ onAdd, onUploaded }: { onAdd: (i: LibraryItem) => void; onUploaded: (i: LibraryItem) => void }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<LibraryItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = useCallback(async (q: string) => {
    const page = await api.library({ search: q || undefined, limit: 50 });
    setResults(page.items);
  }, []);
  useEffect(() => {
    run("").catch(() => undefined);
  }, [run]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg(null);
    try {
      const durationMs = await readDurationMs(file);
      const item = await api.uploadLocal(file, "commercial", durationMs, file.name);
      onUploaded(item);
      setMsg(`Uploaded “${item.title}”.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="picker">
      <h3>Add programs</h3>
      <div className="row">
        <input className="grow" placeholder="Search library…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run(search)} />
        <button className="ghost" onClick={() => run(search)}>Search</button>
      </div>
      <label className="upload">
        {uploading ? "Uploading…" : "＋ Upload a clip (bumper / commercial)"}
        <input type="file" accept="video/*" onChange={upload} disabled={uploading} hidden />
      </label>
      {msg && <p className="muted small">{msg}</p>}
      <div className="list tall">
        {results.map((it) => (
          <div className="list-item" key={it.id}>
            <span className="badge">{it.source === "local" ? "local" : it.type}</span>
            <span className="title">{it.title}</span>
            <span className="spacer" />
            <button className="mini add" onClick={() => onAdd(it)}>＋</button>
          </div>
        ))}
      </div>
    </div>
  );
}
