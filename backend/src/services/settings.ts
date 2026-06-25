import type { JellyfinSettings, Settings } from "@spudcast/shared";
import { db } from "../db.js";

const getStmt = db.prepare<[string], { value: string }>(
  "SELECT value FROM settings WHERE key = ?",
);
const upsertStmt = db.prepare<[string, string]>(
  `INSERT INTO settings (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
);

function getRaw(key: string): string | undefined {
  return getStmt.get(key)?.value;
}

function setRaw(key: string, value: string): void {
  upsertStmt.run(key, value);
}

const DEFAULT_SYNC_TIME = "04:00";

/** Read the full settings object (secrets included — server-side use only). */
export function getSettings(): Settings {
  return {
    jellyfin: {
      baseUrl: getRaw("jellyfin.baseUrl") ?? "",
      apiKey: getRaw("jellyfin.apiKey") ?? "",
    },
    tmdbApiKey: getRaw("tmdb.apiKey") || undefined,
    omdbApiKey: getRaw("omdb.apiKey") || undefined,
    youtubeApiKey: getRaw("youtube.apiKey") || undefined,
    dailySyncTime: getRaw("sync.dailyTime") ?? DEFAULT_SYNC_TIME,
    lastSyncAt: getRaw("sync.lastAt") ?? null,
  };
}

export function setJellyfinSettings(jf: JellyfinSettings): void {
  setRaw("jellyfin.baseUrl", jf.baseUrl.replace(/\/+$/, ""));
  setRaw("jellyfin.apiKey", jf.apiKey);
}

export function hasJellyfinConfigured(): boolean {
  return Boolean(getRaw("jellyfin.baseUrl") && getRaw("jellyfin.apiKey"));
}

export function setLastSyncAt(iso: string): void {
  setRaw("sync.lastAt", iso);
}
