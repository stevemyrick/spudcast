/**
 * Shared domain + API contract types for spudcast.
 * Imported by the backend and both frontends so the wire format stays in sync.
 */

// ---------------------------------------------------------------------------
// Users & auth
// ---------------------------------------------------------------------------

export type UserRole = "admin" | "user";

export interface User {
  id: number;
  username: string;
  role: UserRole;
  createdAt: string;
}

/** What the client knows about the current session. */
export interface SessionInfo {
  authenticated: boolean;
  user: User | null;
}

// ---------------------------------------------------------------------------
// First-run setup
// ---------------------------------------------------------------------------

export interface SetupStatus {
  /** True once an admin account exists and core settings are saved. */
  complete: boolean;
  hasAdmin: boolean;
  hasJellyfin: boolean;
}

export interface SetupRequest {
  username: string;
  password: string;
  jellyfin: JellyfinSettings;
}

// ---------------------------------------------------------------------------
// Settings (server-side only secrets; never sent raw to untrusted clients)
// ---------------------------------------------------------------------------

export interface JellyfinSettings {
  baseUrl: string;
  apiKey: string;
}

export interface Settings {
  jellyfin: JellyfinSettings;
  tmdbApiKey?: string;
  omdbApiKey?: string;
  youtubeApiKey?: string;
  /** Local time-of-day (HH:mm) for the daily library sync. */
  dailySyncTime: string;
  lastSyncAt?: string | null;
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export type LibrarySource = "jellyfin" | "youtube" | "local";

export type LibraryItemType =
  | "movie"
  | "episode"
  | "commercial"
  | "bumper"
  | "music_video";

export interface LibraryItem {
  id: number;
  source: LibrarySource;
  externalId: string;
  title: string;
  type: LibraryItemType;
  durationMs: number;
  year?: number | null;
  genres: string[];
  tags: string[];
  thumbUrl?: string | null;
  /** Source-specific reference: jellyfin item id, youtube id, or local path. */
  streamRef: string;
}

// ---------------------------------------------------------------------------
// Channels & scheduling
// ---------------------------------------------------------------------------

export type ChannelType = "manual" | "auto" | "weather";
export type ChannelStrategy = "ordered" | "shuffle" | "dayparts";

export interface Channel {
  id: number;
  number: number;
  name: string;
  ownerId: number;
  onAir: boolean;
  type: ChannelType;
  strategy: ChannelStrategy;
  /** Rule set for auto channels (genres/decade/tags/sources). */
  rules?: Record<string, unknown> | null;
  /** Channel-type config, e.g. weather location + audio source. */
  config?: Record<string, unknown> | null;
  iconUrl?: string | null;
  enabled: boolean;
}

/** A materialized slot in a channel's program guide. */
export interface ProgramEntry {
  id: number;
  channelId: number;
  libraryItemId: number;
  startUtc: string;
  endUtc: string;
  isFiller: boolean;
}

/** The player's answer to "what's on channel N right now?" */
export interface NowPlaying {
  channel: Channel;
  item: LibraryItem;
  /** Offset into the item, in ms, where the player should join. */
  offsetMs: number;
  /** When the current item ends (ISO), so the player can schedule the next fetch. */
  endsAt: string;
}

export interface HealthResponse {
  status: "ok";
  version: string;
  uptimeSec: number;
}
