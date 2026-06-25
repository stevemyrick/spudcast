import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { dbPath, ensureDataDirs } from "./config.js";

// The DB is opened at import time, so guarantee its directory exists first.
ensureDataDirs();

export const db: DatabaseType = new Database(dbPath);

// Pragmas: WAL for concurrent reads during playback, foreign keys for integrity.
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/**
 * Ordered, append-only migrations. Each entry is applied once; the index+1 is
 * stored in PRAGMA user_version so re-runs are idempotent. Never edit an applied
 * migration — add a new one.
 */
const migrations: string[] = [
  // 1 — core schema
  `
  CREATE TABLE users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('admin','user')),
    createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE devices (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,
    token     TEXT NOT NULL UNIQUE,
    kind      TEXT NOT NULL CHECK (kind IN ('tv','remote')),
    lastSeen  TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Single-row key/value store for settings & secrets (server-side only).
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE library_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    source     TEXT NOT NULL CHECK (source IN ('jellyfin','youtube','local')),
    externalId TEXT NOT NULL,
    title      TEXT NOT NULL,
    type       TEXT NOT NULL,
    durationMs INTEGER NOT NULL,
    year       INTEGER,
    genres     TEXT NOT NULL DEFAULT '[]',
    tags       TEXT NOT NULL DEFAULT '[]',
    thumbUrl   TEXT,
    streamRef  TEXT NOT NULL,
    updatedAt  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (source, externalId)
  );

  CREATE TABLE channels (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    number   INTEGER NOT NULL UNIQUE,
    name     TEXT NOT NULL,
    ownerId  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    onAir    INTEGER NOT NULL DEFAULT 0,
    type     TEXT NOT NULL CHECK (type IN ('manual','auto','weather')),
    strategy TEXT NOT NULL DEFAULT 'ordered',
    rules    TEXT,
    config   TEXT,
    iconUrl  TEXT,
    enabled  INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE channel_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    channelId     INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    libraryItemId INTEGER NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
    ord           INTEGER NOT NULL
  );
  CREATE INDEX idx_channel_items_channel ON channel_items(channelId, ord);

  CREATE TABLE program_entries (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    channelId     INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    libraryItemId INTEGER NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
    startUtc      TEXT NOT NULL,
    endUtc        TEXT NOT NULL,
    isFiller      INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_program_entries_lookup ON program_entries(channelId, startUtc, endUtc);
  `,
];

/** Apply any pending migrations. Safe to call on every boot. */
export function migrate(): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let i = current; i < migrations.length; i++) {
    const sql = migrations[i];
    const tx = db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${i + 1}`);
    });
    tx();
  }
}

// Migrate at import time so services can prepare statements against the schema.
migrate();
