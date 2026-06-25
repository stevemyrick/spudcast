import type {
  LibraryItem,
  LibraryItemType,
  LibraryPage,
  LibraryQuery,
} from "@spudcast/shared";
import { db } from "../db.js";
import { ticksToMs, type JellyfinItem } from "./jellyfin.js";

interface LibraryRow {
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
}

function rowToItem(row: LibraryRow): LibraryItem {
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
  };
}

const upsertStmt = db.prepare(
  `INSERT INTO library_items
     (source, externalId, title, type, durationMs, year, genres, tags, thumbUrl, streamRef, updatedAt)
   VALUES
     (@source, @externalId, @title, @type, @durationMs, @year, @genres, @tags, @thumbUrl, @streamRef, datetime('now'))
   ON CONFLICT(source, externalId) DO UPDATE SET
     title = excluded.title,
     type = excluded.type,
     durationMs = excluded.durationMs,
     year = excluded.year,
     genres = excluded.genres,
     tags = excluded.tags,
     thumbUrl = excluded.thumbUrl,
     streamRef = excluded.streamRef,
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
