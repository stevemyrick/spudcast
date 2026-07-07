import type {
  AutoRules,
  Channel,
  ChannelConfig,
  ChannelStrategy,
  ChannelType,
  LibraryItem,
} from "@spudcast/shared";
import { db } from "../db.js";
import { queryByRules, rowToItem, type LibraryRow } from "./library.js";

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
  locked: number;
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
    rules: r.rules ? (JSON.parse(r.rules) as AutoRules) : null,
    config: r.config ? (JSON.parse(r.config) as ChannelConfig) : null,
    iconUrl: r.iconUrl,
    enabled: Boolean(r.enabled),
    locked: Boolean(r.locked),
  };
}

export interface CreateChannelInput {
  number: number;
  name: string;
  type?: ChannelType;
  strategy?: ChannelStrategy;
  onAir?: boolean;
  rules?: AutoRules;
  config?: ChannelConfig;
}

export function createChannel(ownerId: number, input: CreateChannelInput): Channel {
  const info = db
    .prepare(
      `INSERT INTO channels (number, name, ownerId, onAir, type, strategy, rules, config, enabled)
       VALUES (@number, @name, @ownerId, @onAir, @type, @strategy, @rules, @config, 1)`,
    )
    .run({
      number: input.number,
      name: input.name,
      ownerId,
      onAir: input.onAir ? 1 : 0,
      type: input.type ?? "manual",
      strategy: input.strategy ?? "ordered",
      rules: input.rules ? JSON.stringify(input.rules) : null,
      config: input.config ? JSON.stringify(input.config) : null,
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
  config?: ChannelConfig;
  rules?: AutoRules;
  locked?: boolean;
}

export function updateChannel(id: number, input: UpdateChannelInput): Channel | undefined {
  const sets: string[] = [];
  const args: Record<string, unknown> = { id };
  if (input.name !== undefined) { sets.push("name = @name"); args.name = input.name; }
  if (input.number !== undefined) { sets.push("number = @number"); args.number = input.number; }
  if (input.strategy !== undefined) { sets.push("strategy = @strategy"); args.strategy = input.strategy; }
  if (input.iconUrl !== undefined) { sets.push("iconUrl = @iconUrl"); args.iconUrl = input.iconUrl; }
  if (input.onAir !== undefined) { sets.push("onAir = @onAir"); args.onAir = input.onAir ? 1 : 0; }
  if (input.config !== undefined) { sets.push("config = @config"); args.config = JSON.stringify(input.config); }
  if (input.rules !== undefined) { sets.push("rules = @rules"); args.rules = JSON.stringify(input.rules); }
  if (input.locked !== undefined) { sets.push("locked = @locked"); args.locked = input.locked ? 1 : 0; }
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

/** Small deterministic PRNG so an auto channel's shuffle is stable across calls. */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Insert "commercial break" filler (commercials/bumpers) between programs when the
 * channel opts in. Filler comes from the global commercial/bumper pool, stably
 * shuffled per channel and rotated so breaks vary around the loop.
 */
function withFiller(channel: Channel, programs: LibraryItem[]): LibraryItem[] {
  const filler = (channel.config as ChannelConfig | null)?.filler;
  if (!filler?.enabled || filler.perBreak < 1 || programs.length === 0) return programs;

  const pool = seededShuffle(
    queryByRules({ types: ["commercial", "bumper"] }),
    channel.id + 7,
  );
  if (pool.length === 0) return programs;

  const out: LibraryItem[] = [];
  let f = 0;
  for (const program of programs) {
    out.push(program);
    for (let i = 0; i < filler.perBreak; i++) {
      out.push(pool[f % pool.length]);
      f++;
    }
  }
  return out;
}

/**
 * The items that make up a channel's loop. Manual channels use their stored
 * playlist; auto channels resolve their rules live (so newly-synced content
 * flows in), with a stable shuffle when the strategy calls for it. Either kind
 * can interleave commercial-break filler.
 */
export function resolveChannelItems(channel: Channel): LibraryItem[] {
  const programs =
    channel.type === "auto"
      ? (() => {
          const items = queryByRules((channel.rules ?? {}) as AutoRules);
          return channel.strategy === "shuffle" ? seededShuffle(items, channel.id) : items;
        })()
      : getItems(channel.id);
  return withFiller(channel, programs);
}

/** The ordered library items that make up a manual channel's loop. */
export function getItems(channelId: number): LibraryItem[] {
  const rows = db
    .prepare(
      `SELECT li.* FROM channel_items ci
       JOIN library_items li ON li.id = ci.libraryItemId
       WHERE ci.channelId = ? ORDER BY ci.ord`,
    )
    .all(channelId) as LibraryRow[];
  return rows.map(rowToItem);
}
