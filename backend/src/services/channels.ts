import type { Channel, ChannelStrategy, ChannelType, LibraryItem } from "@spudcast/shared";
import { db } from "../db.js";

interface ChannelRow {
  id: number;
  number: number;
  name: string;
  ownerId: number;
  onAir: number;
  type: string;
  strategy: string;
  rules: string | null;
  config: string | null;
  iconUrl: string | null;
  enabled: number;
}

function rowToChannel(r: ChannelRow): Channel {
  return {
    id: r.id,
    number: r.number,
    name: r.name,
    ownerId: r.ownerId,
    onAir: Boolean(r.onAir),
    type: r.type as ChannelType,
    strategy: r.strategy as ChannelStrategy,
    rules: r.rules ? (JSON.parse(r.rules) as Record<string, unknown>) : null,
    config: r.config ? (JSON.parse(r.config) as Record<string, unknown>) : null,
    iconUrl: r.iconUrl,
    enabled: Boolean(r.enabled),
  };
}

export interface CreateChannelInput {
  number: number;
  name: string;
  type?: ChannelType;
  strategy?: ChannelStrategy;
  onAir?: boolean;
}

export function createChannel(ownerId: number, input: CreateChannelInput): Channel {
  const info = db
    .prepare(
      `INSERT INTO channels (number, name, ownerId, onAir, type, strategy, enabled)
       VALUES (@number, @name, @ownerId, @onAir, @type, @strategy, 1)`,
    )
    .run({
      number: input.number,
      name: input.name,
      ownerId,
      onAir: input.onAir ? 1 : 0,
      type: input.type ?? "manual",
      strategy: input.strategy ?? "ordered",
    });
  return getById(Number(info.lastInsertRowid))!;
}

export function listChannels(opts: { onAirOnly?: boolean } = {}): Channel[] {
  const sql = opts.onAirOnly
    ? "SELECT * FROM channels WHERE onAir = 1 AND enabled = 1 ORDER BY number"
    : "SELECT * FROM channels ORDER BY number";
  return (db.prepare(sql).all() as ChannelRow[]).map(rowToChannel);
}

export function getById(id: number): Channel | undefined {
  const r = db.prepare("SELECT * FROM channels WHERE id = ?").get(id) as ChannelRow | undefined;
  return r ? rowToChannel(r) : undefined;
}

export function getByNumber(number: number): Channel | undefined {
  const r = db.prepare("SELECT * FROM channels WHERE number = ?").get(number) as
    | ChannelRow
    | undefined;
  return r ? rowToChannel(r) : undefined;
}

export function setOnAir(id: number, onAir: boolean): void {
  db.prepare("UPDATE channels SET onAir = ? WHERE id = ?").run(onAir ? 1 : 0, id);
}

export interface UpdateChannelInput {
  name?: string;
  number?: number;
  strategy?: ChannelStrategy;
  iconUrl?: string | null;
  onAir?: boolean;
}

export function updateChannel(id: number, input: UpdateChannelInput): Channel | undefined {
  const sets: string[] = [];
  const args: Record<string, unknown> = { id };
  if (input.name !== undefined) { sets.push("name = @name"); args.name = input.name; }
  if (input.number !== undefined) { sets.push("number = @number"); args.number = input.number; }
  if (input.strategy !== undefined) { sets.push("strategy = @strategy"); args.strategy = input.strategy; }
  if (input.iconUrl !== undefined) { sets.push("iconUrl = @iconUrl"); args.iconUrl = input.iconUrl; }
  if (input.onAir !== undefined) { sets.push("onAir = @onAir"); args.onAir = input.onAir ? 1 : 0; }
  if (sets.length) db.prepare(`UPDATE channels SET ${sets.join(", ")} WHERE id = @id`).run(args);
  return getById(id);
}

export function deleteChannel(id: number): void {
  db.prepare("DELETE FROM channels WHERE id = ?").run(id);
}

/** Replace a channel's playlist with the given ordered list (handles reorder/remove/add). */
export function setItems(channelId: number, libraryItemIds: number[]): void {
  const del = db.prepare("DELETE FROM channel_items WHERE channelId = ?");
  const ins = db.prepare("INSERT INTO channel_items (channelId, libraryItemId, ord) VALUES (?, ?, ?)");
  const tx = db.transaction(() => {
    del.run(channelId);
    libraryItemIds.forEach((itemId, i) => ins.run(channelId, itemId, i));
  });
  tx();
}

/** Append library items to a channel's playlist, preserving order. */
export function addItems(channelId: number, libraryItemIds: number[]): void {
  const maxOrd =
    (db.prepare("SELECT MAX(ord) AS m FROM channel_items WHERE channelId = ?").get(channelId) as {
      m: number | null;
    }).m ?? -1;
  const insert = db.prepare(
    "INSERT INTO channel_items (channelId, libraryItemId, ord) VALUES (?, ?, ?)",
  );
  const tx = db.transaction(() => {
    libraryItemIds.forEach((itemId, i) => insert.run(channelId, itemId, maxOrd + 1 + i));
  });
  tx();
}

/** The ordered library items that make up a channel's loop. */
export function getItems(channelId: number): LibraryItem[] {
  const rows = db
    .prepare(
      `SELECT li.* FROM channel_items ci
       JOIN library_items li ON li.id = ci.libraryItemId
       WHERE ci.channelId = ? ORDER BY ci.ord`,
    )
    .all(channelId) as Array<{
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
  }>;
  return rows.map((r) => ({
    id: r.id,
    source: r.source as LibraryItem["source"],
    externalId: r.externalId,
    title: r.title,
    type: r.type as LibraryItem["type"],
    durationMs: r.durationMs,
    year: r.year,
    genres: JSON.parse(r.genres) as string[],
    tags: JSON.parse(r.tags) as string[],
    thumbUrl: r.thumbUrl,
    streamRef: r.streamRef,
  }));
}
