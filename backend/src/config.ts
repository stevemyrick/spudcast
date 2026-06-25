import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Runtime configuration, all overridable via environment for Docker/Synology. */
export const config = {
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? "0.0.0.0",
  /** Directory for the SQLite db, artwork cache and uploads (mount as a volume). */
  dataDir: resolve(process.env.SPUDCAST_DATA_DIR ?? "./data"),
  /** Secret used to sign session cookies. Auto-generated + persisted if unset. */
  cookieSecret: process.env.SPUDCAST_COOKIE_SECRET ?? "",
  /** Where the built admin/player static assets live (production). */
  webDir: resolve(process.env.SPUDCAST_WEB_DIR ?? "./public"),
  isProduction: process.env.NODE_ENV === "production",
} as const;

export const dbPath = resolve(config.dataDir, "spudcast.sqlite");
export const uploadsDir = resolve(config.dataDir, "uploads");
export const artworkCacheDir = resolve(config.dataDir, "artwork");
export const secretFilePath = resolve(config.dataDir, "cookie-secret");

/** Ensure all runtime directories exist before anything touches them. */
export function ensureDataDirs(): void {
  for (const dir of [config.dataDir, uploadsDir, artworkCacheDir, dirname(dbPath)]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}
