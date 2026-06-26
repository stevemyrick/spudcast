import type { FastifyInstance, InjectOptions } from "fastify";
import { buildApp } from "../src/app.js";
import { db } from "../src/db.js";
import { _resetRateLimits } from "../src/services/rate-limit.js";

/** Wipe every table so each test starts from a clean slate. */
export function resetDb(): void {
  db.pragma("foreign_keys = OFF");
  for (const t of [
    "program_entries",
    "channel_items",
    "channels",
    "library_items",
    "devices",
    "settings",
    "users",
  ]) {
    db.exec(`DELETE FROM ${t};`);
  }
  db.exec("DELETE FROM sqlite_sequence;");
  db.pragma("foreign_keys = ON");
  _resetRateLimits();
}

export async function makeApp(): Promise<FastifyInstance> {
  return buildApp({ logger: false });
}

/** Insert a library item directly (bypassing Jellyfin). Returns its id. */
export function seedItem(over: Partial<{
  source: string;
  externalId: string;
  title: string;
  type: string;
  durationMs: number;
  year: number | null;
  genres: string[];
  streamRef: string;
}> = {}): number {
  const ext = over.externalId ?? `ext-${Math.random().toString(36).slice(2)}`;
  const info = db
    .prepare(
      `INSERT INTO library_items (source, externalId, title, type, durationMs, year, genres, tags, streamRef)
       VALUES (@source,@externalId,@title,@type,@durationMs,@year,@genres,'[]',@streamRef)`,
    )
    .run({
      source: over.source ?? "local",
      externalId: ext,
      title: over.title ?? "Item",
      type: over.type ?? "movie",
      durationMs: over.durationMs ?? 60000,
      year: over.year ?? null,
      genres: JSON.stringify(over.genres ?? []),
      streamRef: over.streamRef ?? ext,
    });
  return Number(info.lastInsertRowid);
}

/** Pull the session cookie out of an inject response. */
export function sessionCookie(res: { cookies: Array<{ name: string; value: string }> }): string {
  const c = res.cookies.find((x) => x.name === "spud_session");
  if (!c) throw new Error("no session cookie set");
  return `spud_session=${c.value}`;
}

/** Run first-run setup, returning the admin session cookie. */
export async function setupAdmin(
  app: FastifyInstance,
  body: Partial<{ username: string; password: string; baseUrl: string; apiKey: string }> = {},
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/setup",
    payload: {
      username: body.username ?? "admin",
      password: body.password ?? "supersecret",
      jellyfin: { baseUrl: body.baseUrl ?? "http://jellyfin.local:8096", apiKey: body.apiKey ?? "k" },
    },
  });
  if (res.statusCode !== 201) throw new Error(`setup failed: ${res.statusCode} ${res.body}`);
  return sessionCookie(res);
}

/** Create a regular user (as admin) and return their session cookie. */
export async function loginAs(
  app: FastifyInstance,
  adminCookie: string,
  username: string,
  password = "userpass123",
): Promise<string> {
  await app.inject({
    method: "POST",
    url: "/api/users",
    headers: { cookie: adminCookie },
    payload: { username, password, role: "user" },
  });
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username, password } });
  return sessionCookie(res);
}

export function inj(app: FastifyInstance, cookie: string, opts: InjectOptions) {
  return app.inject({ ...opts, headers: { ...(opts.headers ?? {}), cookie } });
}
