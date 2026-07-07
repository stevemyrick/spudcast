import { useEffect, useState } from "react";
import type { LibraryItem, LibraryItemType, SyncStatus } from "@spudcast/shared";
import { fmtDuration } from "@spudcast/shared";
import { api } from "./api.js";

type TypeFilter = "all" | "movie" | "episode";
const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "episode", label: "TV" },
];

export function LibraryView() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [showTags, setShowTags] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load(type: TypeFilter = typeFilter) {
    const [s, page] = await Promise.all([
      api.syncStatus(),
      api.library({
        search: search || undefined,
        type: type === "all" ? undefined : (type as LibraryItemType),
        limit: 100,
      }),
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

      <div className="row">
        <div className="chips">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={typeFilter === f.value ? "chip on" : "chip"}
              onClick={() => { setTypeFilter(f.value); load(f.value).catch(() => undefined); }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <button className="ghost" onClick={() => setShowTags((s) => !s)}>
          {showTags ? "Hide tags" : "Show tags"}
        </button>
      </div>

      {msg && <p className="muted small">{msg}</p>}

      <div className="list">
        {items.map((it) => (
          <div className="list-item wrap" key={it.id}>
            <div className="row grow" style={{ margin: 0 }}>
              <span className="badge">{it.type}</span>
              <span className="title">{it.title}</span>
              <span className="spacer" />
              <span className="muted small">{it.year ?? ""}</span>
              <span className="muted small">{fmtDuration(it.durationMs)}</span>
            </div>
            {showTags && (it.genres.length > 0 || it.tags.length > 0) && (
              <div className="chips tags-row">
                {it.genres.map((g) => <span key={`g-${g}`} className="chip static">{g}</span>)}
                {it.tags.map((t) => <span key={`t-${t}`} className="chip static tag">{t}</span>)}
              </div>
            )}
            {showTags && it.genres.length === 0 && it.tags.length === 0 && (
              <span className="muted small">No tags</span>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="muted">No items. Click “Refresh library”.</p>}
      </div>
      {total > items.length && <p className="muted small">Showing {items.length} of {total}.</p>}
    </div>
  );
}
