import { randomBytes, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import type {
  JellyfinSettings,
  Settings,
  SettingsUpdate,
  SettingsView,
} from "@spudcast/shared";
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
/** EDT/EST — sensible default for the schedule/guide display. */
const DEFAULT_TZ = "America/New_York";

/** The IANA timezone used to render schedule/guide times. */
export function getDisplayTimezone(): string {
  return getRaw("display.timezone") || DEFAULT_TZ;
}

/** True if the string is a timezone the runtime's Intl supports. */
function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

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
    timezone: getDisplayTimezone(),
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

/** Redacted view for the admin UI — secrets become presence booleans. */
export function getSettingsView(): SettingsView {
  return {
    jellyfinBaseUrl: getRaw("jellyfin.baseUrl") ?? "",
    hasJellyfinKey: Boolean(getRaw("jellyfin.apiKey")),
    hasTmdbKey: Boolean(getRaw("tmdb.apiKey")),
    hasOmdbKey: Boolean(getRaw("omdb.apiKey")),
    hasYoutubeKey: Boolean(getRaw("youtube.apiKey")),
    dailySyncTime: getRaw("sync.dailyTime") ?? DEFAULT_SYNC_TIME,
    lastSyncAt: getRaw("sync.lastAt") ?? null,
    timezone: getDisplayTimezone(),
    hasStationPin: hasStationPin(),
  };
}

/**
 * A capability key for the IPTV (M3U/XMLTV) endpoints, generated on first use.
 * It authorizes guide/stream access only (same posture as a TV device token) so
 * external players can reach spudcast without exposing the Jellyfin key.
 */
export function getOrCreateIptvKey(): string {
  let key = getRaw("iptv.key");
  if (!key) {
    key = randomBytes(24).toString("hex");
    setRaw("iptv.key", key);
  }
  return key;
}

export function regenerateIptvKey(): string {
  const key = randomBytes(24).toString("hex");
  setRaw("iptv.key", key);
  return key;
}

// --- Parental "station PIN" (gates locked channels on the TV) ---

const PIN_KEY = "station.pinHash";

export function hasStationPin(): boolean {
  return Boolean(getRaw(PIN_KEY));
}

/** Set (or clear, when pin is empty) the household PIN. Hashed with argon2. */
export async function setStationPin(pin: string): Promise<void> {
  if (!pin) {
    db.prepare("DELETE FROM settings WHERE key = ?").run(PIN_KEY);
    return;
  }
  setRaw(PIN_KEY, await argon2.hash(pin, { type: argon2.argon2id }));
}

export async function verifyStationPin(pin: string): Promise<boolean> {
  const hash = getRaw(PIN_KEY);
  if (!hash) return false;
  return argon2.verify(hash, pin).catch(() => false);
}

export function isValidIptvKey(key: string | undefined | null): boolean {
  if (!key) return false;
  const expected = getRaw("iptv.key");
  if (!expected) return false;
  // Constant-time compare so response timing can't leak the key byte-by-byte.
  const a = Buffer.from(key);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Apply a partial settings update. Omitted/empty secret fields are left as-is. */
export function applySettingsUpdate(update: SettingsUpdate): void {
  if (update.jellyfinBaseUrl !== undefined) {
    setRaw("jellyfin.baseUrl", update.jellyfinBaseUrl.replace(/\/+$/, ""));
  }
  if (update.jellyfinApiKey) setRaw("jellyfin.apiKey", update.jellyfinApiKey);
  if (update.tmdbApiKey) setRaw("tmdb.apiKey", update.tmdbApiKey);
  if (update.omdbApiKey) setRaw("omdb.apiKey", update.omdbApiKey);
  if (update.youtubeApiKey) setRaw("youtube.apiKey", update.youtubeApiKey);
  if (update.dailySyncTime !== undefined) {
    if (!TIME_RE.test(update.dailySyncTime)) {
      throw new Error("dailySyncTime must be HH:mm (24-hour)");
    }
    setRaw("sync.dailyTime", update.dailySyncTime);
  }
  if (update.timezone !== undefined) {
    if (!isValidTimezone(update.timezone)) {
      throw new Error("timezone must be a valid IANA zone (e.g. America/New_York)");
    }
    setRaw("display.timezone", update.timezone);
  }
}
