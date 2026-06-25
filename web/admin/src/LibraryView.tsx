import { useEffect, useState } from "react";
import type { LibraryItem, SyncStatus } from "@spudcast/shared";
import { api } from "./api.js";

function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

export function LibraryView() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const [s, page] = await Promise.all([
      api.syncStatus(),
      api.library({ search: search || undefined, limit: 100 }),
    ]);
    setStatus(s);
    setItems(page.items);
    setTotal(page.total);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e instanceof Error ? e.message : "Failed to load"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.refreshLibrary();
      setMsg(`Synced: +${r.added} added, ${r.updated} updated, ${r.total} total.`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="row">
        <div>
          <h2>Library</h2>
          <p className="muted small">
            {status ? `${status.itemCount} items` : "…"}
            {status?.lastSyncAt ? ` · last synced ${new Date(status.lastSyncAt).toLocaleString()}` : " · never synced"}
          </p>
        </div>
        <span className="spacer" />
        <button onClick={refresh} disabled={busy}>{busy ? "Syncing…" : "Refresh library"}</button>
      </div>

      <div className="row">
        <input
          className="grow"
          placeholder="Search titles…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <button className="ghost" onClick={() => load()}>Search</button>
      </div>

      {msg && <p className="muted small">{msg}</p>}

      <div className="list">
        {items.map((it) => (
          <div className="list-item" key={it.id}>
            <span className="badge">{it.type}</span>
            <span className="title">{it.title}</span>
            <span className="spacer" />
            <span className="muted small">{it.year ?? ""}</span>
            <span className="muted small">{fmtDuration(it.durationMs)}</span>
          </div>
        ))}
        {items.length === 0 && <p className="muted">No items. Click “Refresh library”.</p>}
      </div>
      {total > items.length && <p className="muted small">Showing {items.length} of {total}.</p>}
    </div>
  );
}
