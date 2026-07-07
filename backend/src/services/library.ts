import type {
  AutoRules,
  LibraryItem,
  LibraryItemType,
  LibraryPage,
  LibraryQuery,
} from "@spudcast/shared";
import { db } from "../db.js";
import { ticksToMs, type JellyfinItem } from "./jellyfin.js";

export interface LibraryRow {
  id: number;
  source: string;
  externalId: string;
  title: string;
  type: string;
  durationMs: number;
  year: number | null;
  genres: string;
  tags: string;
  thumbUrl: string | null;
  streamRef: string;
  overview: string | null;
  rating: string | null;
}

/** Map a raw library_items row to a LibraryItem. Shared by every library query. */
export function rowToItem(row: LibraryRow): LibraryItem {
  return {
    id: row.id,
    source: row.source as LibraryItem["source"],
    externalId: row.externalId,
    title: row.title,
    type: row.type as LibraryItemType,
    durationMs: row.durationMs,
    year: row.year,
    genres: JSON.parse(row.genres) as string[],
    tags: JSON.parse(row.tags) as string[],
    thumbUrl: row.thumbUrl,
    streamRef: row.streamRef,
    overview: row.overview,
    rating: row.rating,
  };
}

/** Map a Jellyfin item to a row for the local cache. */
export function mapJellyfinItem(jf: JellyfinItem): Omit<LibraryItem, "id"> {
  const type: LibraryItemType = jf.Type === "Episode" ? "episode" : "movie";
  const title =
    jf.Type === "Episode" && jf.SeriesName ? `${jf.SeriesName} — ${jf.Name}` : jf.Name;
  return {
    source: "jellyfin",
    externalId: jf.Id,
    title,
    type,
    durationMs: ticksToMs(jf.RunTimeTicks),
    year: jf.ProductionYear ?? null,
    genres: jf.Genres ?? [],
    tags: jf.Tags ?? [],
    thumbUrl: `/api/art/jellyfin/${jf.Id}`,
    streamRef: jf.Id,
    overview: jf.Overview ?? null,
    rating: jf.OfficialRating ?? null,
  };
}

const upsertStmt = db.prepare(
  `INSERT INTO library_items
     (source, externalId, title, type, durationMs, year, genres, tags, thumbUrl, streamRef, overview, rating, updatedAt)
   VALUES
     (@source, @externalId, @title, @type, @durationMs, @year, @genres, @tags, @thumbUrl, @streamRef, @overview, @rating, datetime('now'))
   ON CONFLICT(source, externalId) DO UPDATE SET
     title = excluded.title,
     type = excluded.type,
     durationMs = excluded.durationMs,
     year = excluded.year,
     genres = excluded.genres,
     tags = excluded.tags,
     thumbUrl = excluded.thumbUrl,
     streamRef = excluded.streamRef,
     overview = excluded.overview,
     rating = excluded.rating,
     updatedAt = datetime('now')`,
);

const existsStmt = db.prepare<[string, string], { id: number }>(
  "SELECT id FROM library_items WHERE source = ? AND externalId = ?",
);

const upsertManyTx = db.transaction(
  (items: Array<Omit<LibraryItem, "id">>): { added: number; updated: number } => {
    let added = 0;
    let updated = 0;
    for (const item of items) {
      const existed = existsStmt.get(item.source, item.externalId);
      upsertStmt.run({
        ...item,
        genres: JSON.stringify(item.genres),
        tags: JSON.stringify(item.tags),
      });
      if (existed) updated++;
      else added++;
    }
    return { added, updated };
  },
);

/**
 * Upsert a batch of items in a single transaction. Returns how many were newly
 * inserted vs updated so sync can report incremental progress.
 */
export function upsertMany(
  items: Array<Omit<LibraryItem, "id">>,
): { added: number; updated: number } {
  return upsertManyTx(items);
}

/** Insert a locally-uploaded item (bumper/commercial/etc.) and return it. */
export function insertLocalItem(input: {
  externalId: string;
  title: string;
  type: LibraryItemType;
  durationMs: number;
  streamRef: string;
}): LibraryItem {
  upsertStmt.run({
    source: "local",
    externalId: input.externalId,
    title: input.title,
    type: input.type,
    durationMs: input.durationMs,
    year: null,
    genres: "[]",
    tags: "[]",
    thumbUrl: null,
    streamRef: input.streamRef,
    overview: null,
    rating: null,
  });
  return getByExternalId("local", input.externalId)!;
}

export function count(): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM library_items").get() as { n: number }).n;
}

export function getById(id: number): LibraryItem | undefined {
  const row = db.prepare("SELECT * FROM library_items WHERE id = ?").get(id) as
    | LibraryRow
    | undefined;
  return row ? rowToItem(row) : undefined;
}

export function getByExternalId(
  source: string,
  externalId: string,
): LibraryItem | undefined {
  const row = db
    .prepare("SELECT * FROM library_items WHERE source = ? AND externalId = ?")
    .get(source, externalId) as LibraryRow | undefined;
  return row ? rowToItem(row) : undefined;
}

/**
 * Resolve an auto-channel's rules to a deterministic, ordered set of items.
 * Re-running picks up newly-synced content automatically (that's the point).
 * Genres are matched against the JSON array column with LIKE.
 */
export function queryByRules(rules: AutoRules): LibraryItem[] {
  const where: string[] = [];
  const args: Record<string, unknown> = {};

  if (rules.types?.length) {
    where.push(`type IN (${rules.types.map((_, i) => `@t${i}`).join(",")})`);
    rules.types.forEach((t, i) => (args[`t${i}`] = t));
  }
  if (rules.sources?.length) {
    where.push(`source IN (${rules.sources.map((_, i) => `@s${i}`).join(",")})`);
    rules.sources.forEach((s, i) => (args[`s${i}`] = s));
  }
  if (rules.yearFrom != null) {
    where.push("year >= @yearFrom");
    args.yearFrom = rules.yearFrom;
  }
  if (rules.yearTo != null) {
    where.push("year <= @yearTo");
    args.yearTo = rules.yearTo;
  }
  if (rules.genres?.length) {
    // Match any of the requested genres (OR within the genre group).
    const ors = rules.genres.map((_, i) => `genres LIKE @g${i}`);
    where.push(`(${ors.join(" OR ")})`);
    rules.genres.forEach((g, i) => (args[`g${i}`] = `%"${g}"%`));
  }
  if (rules.ratings?.length) {
    // Parental filter: only allowed ratings. Items with no rating are excluded.
    where.push(`rating IN (${rules.ratings.map((_, i) => `@rt${i}`).join(",")})`);
    rules.ratings.forEach((r, i) => (args[`rt${i}`] = r));
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  // Fetch all matching rows (capped for safety); exclusions, user ordering and
  // the user-facing limit are applied below so they compose correctly.
  const rows = db
    .prepare(`SELECT * FROM library_items ${whereSql} ORDER BY id LIMIT 2000`)
    .all(args) as LibraryRow[];
  let items = rows.map(rowToItem);

  // Drop items the user removed from the auto lineup.
  if (rules.excludeIds?.length) {
    const excluded = new Set(rules.excludeIds);
    items = items.filter((it) => !excluded.has(it.id));
  }

  // Apply user-pinned ordering: listed ids first (in that order), the rest after.
  if (rules.order?.length) {
    const rank = new Map(rules.order.map((id, i) => [id, i]));
    items.sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const rb = rank.has(b.id) ? rank.get(b.id)! : Number.MAX_SAFE_INTEGER;
      return ra !== rb ? ra - rb : a.id - b.id;
    });
  }

  // Cap to the user's max-episodes limit (default 500) after ordering.
  const limit = Math.min(Math.max(Math.floor(Number(rules.limit)) || 500, 1), 2000);
  return items.slice(0, limit);
}

/** Distinct genres across the cached library, for the auto-channel wizard. */
export function distinctGenres(): string[] {
  const rows = db.prepare("SELECT genres FROM library_items").all() as Array<{ genres: string }>;
  const set = new Set<string>();
  for (const r of rows) for (const g of JSON.parse(r.genres) as string[]) set.add(g);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Distinct content ratings present in the library (for the parental filter). */
export function distinctRatings(): string[] {
  const rows = db
    .prepare("SELECT DISTINCT rating FROM library_items WHERE rating IS NOT NULL AND rating <> '' ORDER BY rating")
    .all() as Array<{ rating: string }>;
  return rows.map((r) => r.rating);
}

/** Filtered, paginated listing for the admin library browser. */
export function list(query: LibraryQuery): LibraryPage {
  const where: string[] = [];
  const args: Record<string, unknown> = {};
  if (query.type) {
    where.push("type = @type");
    args.type = query.type;
  }
  if (query.search) {
    where.push("title LIKE @search");
    args.search = `%${query.search}%`;
  }
  if (query.genre) {
    // genres is a JSON array string; a LIKE match is adequate for the browser.
    where.push("genres LIKE @genre");
    args.genre = `%"${query.genre}"%`;
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM library_items ${whereSql}`).get(args) as {
      n: number;
    }
  ).n;

  const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
  const offset = Math.max(query.offset ?? 0, 0);
  const rows = db
    .prepare(
      `SELECT * FROM library_items ${whereSql}
       ORDER BY title COLLATE NOCASE LIMIT @limit OFFSET @offset`,
    )
    .all({ ...args, limit, offset }) as LibraryRow[];

  return { items: rows.map(rowToItem), total, limit, offset };
}
