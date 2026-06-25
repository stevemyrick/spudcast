import { useCallback, useEffect, useState } from "react";
import type { Channel, LibraryItem, SessionInfo } from "@spudcast/shared";
import { api, readDurationMs } from "./api.js";

function fmtDur(ms: number): string {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Channel Creator: list/create channels and edit a channel's playlist. */
export function ChannelsView({ session }: { session: SessionInfo }) {
  const isAdmin = session.user?.role === "admin";
  const myId = session.user?.id;
  const [channels, setChannels] = useState<Channel[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newNumber, setNewNumber] = useState("");
  const [newName, setNewName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const loadChannels = useCallback(async () => {
    const all = await api.channels(true);
    setChannels(all.filter((c) => isAdmin || c.ownerId === myId));
  }, [isAdmin, myId]);

  useEffect(() => {
    loadChannels().catch(() => undefined);
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

  return (
    <div className="panel">
      <h2>Channels</h2>
      <form className="row" onSubmit={create}>
        <input placeholder="#" value={newNumber} onChange={(e) => setNewNumber(e.target.value)} style={{ width: 70 }} required />
        <input placeholder="Channel name" className="grow" value={newName} onChange={(e) => setNewName(e.target.value)} required />
        <button type="submit">Create</button>
      </form>
      {msg && <p className="error small">{msg}</p>}

      <div className="list">
        {channels.map((c) => (
          <div className="list-item" key={c.id}>
            <span className="ch-pill">{c.number}</span>
            <span className="title">{c.name}</span>
            {c.onAir ? <span className="badge on">ON AIR</span> : <span className="badge">off air</span>}
            <span className="spacer" />
            <button className="ghost" onClick={() => setEditingId(c.id)}>Edit</button>
          </div>
        ))}
        {channels.length === 0 && <p className="muted">No channels yet. Create one above.</p>}
      </div>
    </div>
  );
}

function ChannelEditor({ channelId, onBack }: { channelId: number; onBack: () => void }) {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

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
  }
  async function toggleOnAir() {
    const updated = await api.updateChannel(channel!.id, { onAir: !channel!.onAir });
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

  return (
    <div className="panel wide">
      <div className="row">
        <button className="ghost" onClick={onBack}>← Channels</button>
        <span className="ch-pill">{channel.number}</span>
        <input value={channel.name} onChange={(e) => setChannel({ ...channel, name: e.target.value })} onBlur={(e) => rename(e.target.value)} className="grow" />
        <button className={channel.onAir ? "" : "ghost"} onClick={toggleOnAir}>
          {channel.onAir ? "On air" : "Off air"}
        </button>
        <button className="ghost danger" onClick={del}>Delete</button>
      </div>

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
