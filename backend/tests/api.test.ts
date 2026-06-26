import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { inj, makeApp, resetDb, seedItem, setupAdmin, loginAs, sessionCookie } from "./helpers.js";

let app: FastifyInstance;
beforeAll(async () => {
  app = await makeApp();
  await app.ready();
});
afterAll(async () => app.close());
beforeEach(() => resetDb());

describe("setup & auth", () => {
  it("creates the first admin, then refuses a second setup", async () => {
    const r1 = await app.inject({
      method: "POST",
      url: "/api/setup",
      payload: { username: "admin", password: "supersecret", jellyfin: { baseUrl: "http://jf.local", apiKey: "k" } },
    });
    expect(r1.statusCode).toBe(201);
    const r2 = await app.inject({
      method: "POST",
      url: "/api/setup",
      payload: { username: "x", password: "supersecret", jellyfin: { baseUrl: "http://jf.local", apiKey: "k" } },
    });
    expect(r2.statusCode).toBe(409);
  });

  it("rejects a non-http(s) Jellyfin base URL", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/setup",
      payload: { username: "admin", password: "supersecret", jellyfin: { baseUrl: "javascript:alert(1)", apiKey: "k" } },
    });
    expect(r.statusCode).toBe(400);
  });

  it("rejects bad credentials and accepts good ones", async () => {
    await setupAdmin(app);
    const bad = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "admin", password: "wrong" } });
    expect(bad.statusCode).toBe(401);
    const good = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "admin", password: "supersecret" } });
    expect(good.statusCode).toBe(200);
    expect(sessionCookie(good)).toContain("spud_session=");
  });

  it("locks out after repeated failures (rate limit)", async () => {
    await setupAdmin(app);
    let lastStatus = 0;
    for (let i = 0; i < 10; i++) {
      const r = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "admin", password: "nope" } });
      lastStatus = r.statusCode;
    }
    expect(lastStatus).toBe(429);
  });

  it("never returns secrets from GET /api/settings", async () => {
    const cookie = await setupAdmin(app, { apiKey: "super-secret-key" });
    const res = await inj(app, cookie, { method: "GET", url: "/api/settings" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(JSON.stringify(body)).not.toContain("super-secret-key");
    expect(body.hasJellyfinKey).toBe(true);
  });
});

describe("channel authorization (IDOR)", () => {
  it("stops a user editing another owner's channel", async () => {
    const admin = await setupAdmin(app);
    // Admin owns channel 1.
    const created = await inj(app, admin, { method: "POST", url: "/api/channels", payload: { number: 1, name: "Admin Ch" } });
    const adminChannelId = created.json().id;

    const dana = await loginAs(app, admin, "dana");
    // Dana can create her own.
    const hers = await inj(app, dana, { method: "POST", url: "/api/channels", payload: { number: 2, name: "Dana" } });
    expect(hers.statusCode).toBe(200);
    // Dana cannot edit the admin's channel.
    const attempt = await inj(app, dana, {
      method: "PUT",
      url: `/api/channels/${adminChannelId}`,
      payload: { name: "hacked" },
    });
    expect(attempt.statusCode).toBe(403);
  });

  it("blocks non-admins from admin-only routes", async () => {
    const admin = await setupAdmin(app);
    const dana = await loginAs(app, admin, "dana");
    expect((await inj(app, dana, { method: "GET", url: "/api/users" })).statusCode).toBe(403);
    expect((await inj(app, dana, { method: "GET", url: "/api/settings" })).statusCode).toBe(403);
  });

  it("requires auth for the viewer endpoints", async () => {
    await setupAdmin(app);
    expect((await app.inject({ method: "GET", url: "/api/now-playing/1" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/channels" })).statusCode).toBe(401);
  });

  it("art proxy 404s (not 500s) when Jellyfin is unreachable", async () => {
    const cookie = await setupAdmin(app); // baseUrl points at an unreachable host
    const res = await inj(app, cookie, {
      method: "GET",
      url: "/api/art/jellyfin/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("IPTV export", () => {
  it("gates M3U/XMLTV on the key and hides off-air channels", async () => {
    const admin = await setupAdmin(app);
    const item = seedItem({ title: "Movie", source: "local" });
    const ch = await inj(app, admin, { method: "POST", url: "/api/channels", payload: { number: 7, name: "On", onAir: true } });
    await inj(app, admin, { method: "PUT", url: `/api/channels/${ch.json().id}/items`, payload: { libraryItemIds: [item] } });
    await inj(app, admin, { method: "POST", url: "/api/channels", payload: { number: 9, name: "Off", onAir: false } });

    const info = (await inj(app, admin, { method: "GET", url: "/api/iptv/info" })).json();
    const key = info.key as string;

    expect((await app.inject({ method: "GET", url: "/api/iptv/playlist.m3u" })).statusCode).toBe(401);

    const m3u = await app.inject({ method: "GET", url: `/api/iptv/playlist.m3u?key=${key}` });
    expect(m3u.statusCode).toBe(200);
    expect(m3u.body).toContain('tvg-chno="7"');
    expect(m3u.body).not.toContain('tvg-chno="9"'); // off-air hidden

    const xmltv = await app.inject({ method: "GET", url: `/api/iptv/xmltv.xml?key=${key}` });
    expect(xmltv.body).toContain('channel id="spud.7"');
    expect(xmltv.body).toContain("<programme");

    // Regenerating the key invalidates the old one.
    await inj(app, admin, { method: "POST", url: "/api/iptv/regenerate" });
    expect((await app.inject({ method: "GET", url: `/api/iptv/playlist.m3u?key=${key}` })).statusCode).toBe(401);
  });

  it("rejects a non-http(s) weather embedUrl", async () => {
    const admin = await setupAdmin(app);
    const r = await inj(app, admin, {
      method: "POST",
      url: "/api/channels",
      payload: { number: 13, name: "W", type: "weather", config: { weather: { embedUrl: "javascript:alert(1)" } } },
    });
    expect(r.statusCode).toBe(400);
  });
});
