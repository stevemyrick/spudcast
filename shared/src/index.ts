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

// ---------------------------------------------------------------------------
// Library sync & queries
// ---------------------------------------------------------------------------

export interface LibrarySyncResult {
  added: number;
  updated: number;
  total: number;
  startedAt: string;
  finishedAt: string;
  /** True when an incremental sync (only items changed since lastSyncAt). */
  incremental: boolean;
}

export interface SyncStatus {
  lastSyncAt: string | null;
  itemCount: number;
  running: boolean;
}

export interface LibraryQuery {
  type?: LibraryItemType;
  genre?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface LibraryPage {
  items: LibraryItem[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Settings as shown to the admin UI: secrets are never returned, only whether
 * they are present. Non-secret fields are returned as-is.
 */
export interface SettingsView {
  jellyfinBaseUrl: string;
  hasJellyfinKey: boolean;
  hasTmdbKey: boolean;
  hasOmdbKey: boolean;
  hasYoutubeKey: boolean;
  dailySyncTime: string;
  lastSyncAt: string | null;
}

/** Partial update from the admin. Empty/omitted secret fields leave them unchanged. */
export interface SettingsUpdate {
  jellyfinBaseUrl?: string;
  jellyfinApiKey?: string;
  tmdbApiKey?: string;
  omdbApiKey?: string;
  youtubeApiKey?: string;
  dailySyncTime?: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  /** Server name / version on success, or an error message on failure. */
  detail: string;
}
