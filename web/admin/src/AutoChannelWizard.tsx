import { useEffect, useMemo, useState } from "react";
import type { AutoRules, LibraryItemType } from "@spudcast/shared";
import { api } from "./api.js";

const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
const TYPES: { value: LibraryItemType; label: string }[] = [
  { value: "movie", label: "Movies" },
  { value: "episode", label: "TV episodes" },
  { value: "music_video", label: "Music videos" },
];

/** "Make me a 90s sci-fi channel": pick genres/decades/types, preview, create. */
export function AutoChannelWizard({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [genres, setGenres] = useState<string[]>([]);
  const [pickedGenres, setPickedGenres] = useState<Set<string>>(new Set());
  const [pickedDecades, setPickedDecades] = useState<Set<number>>(new Set());
  const [pickedTypes, setPickedTypes] = useState<Set<LibraryItemType>>(new Set());
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<{ count: number; sample: string[] } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api.genres().then(setGenres).catch(() => undefined);
  }, []);

  const rules: AutoRules = useMemo(() => {
    const decades = [...pickedDecades].sort((a, b) => a - b);
    const r: AutoRules = {};
    if (pickedGenres.size) r.genres = [...pickedGenres];
    if (pickedTypes.size) r.types = [...pickedTypes];
    if (decades.length) {
      r.yearFrom = decades[0];
      r.yearTo = decades[decades.length - 1] + 9;
    }
    return r;
  }, [pickedGenres, pickedTypes, pickedDecades]);

  useEffect(() => {
    const t = setTimeout(() => {
      api.previewRules(rules).then(setPreview).catch(() => setPreview(null));
    }, 250);
    return () => clearTimeout(t);
  }, [rules]);

  function toggle<T>(set: Set<T>, value: T, setter: (s: Set<T>) => void) {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    setter(next);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await api.createChannel({
        number: Number(number),
        name,
        type: "auto",
        strategy: "shuffle",
        rules,
      });
      onCreated();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <div className="panel">
      <div className="row">
        <button className="ghost" onClick={onCancel}>← Channels</button>
        <h2 style={{ margin: 0 }}>New auto channel</h2>
      </div>
      <p className="muted small">
        Pick filters and spudcast builds a self-updating channel — new matching content flows in automatically.
      </p>

      <h3>Genres</h3>
      <div className="chips">
        {genres.map((g) => (
          <button key={g} type="button" className={pickedGenres.has(g) ? "chip on" : "chip"} onClick={() => toggle(pickedGenres, g, setPickedGenres)}>{g}</button>
        ))}
        {genres.length === 0 && <span className="muted small">No genres yet — sync your library first.</span>}
      </div>

      <h3>Decades</h3>
      <div className="chips">
        {DECADES.map((d) => (
          <button key={d} type="button" className={pickedDecades.has(d) ? "chip on" : "chip"} onClick={() => toggle(pickedDecades, d, setPickedDecades)}>{d}s</button>
        ))}
      </div>

      <h3>Content</h3>
      <div className="chips">
        {TYPES.map((t) => (
          <button key={t.value} type="button" className={pickedTypes.has(t.value) ? "chip on" : "chip"} onClick={() => toggle(pickedTypes, t.value, setPickedTypes)}>{t.label}</button>
        ))}
      </div>

      <p className="preview">
        {preview ? <><b>{preview.count}</b> programs match{preview.sample.length ? ` — e.g. ${preview.sample.slice(0, 3).join(", ")}` : ""}.</> : "…"}
      </p>

      <form className="row" onSubmit={create}>
        <input placeholder="#" value={number} onChange={(e) => setNumber(e.target.value)} style={{ width: 70 }} required />
        <input placeholder="Channel name (e.g. 90s Sci-Fi)" className="grow" value={name} onChange={(e) => setName(e.target.value)} required />
        <button type="submit" disabled={!preview || preview.count === 0}>Create channel</button>
      </form>
      {msg && <p className="error small">{msg}</p>}
    </div>
  );
}
