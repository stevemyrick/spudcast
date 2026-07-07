import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { inj, makeApp, resetDb, setupAdmin } from "./helpers.js";
import { createChannel, getById, updateChannel } from "../src/services/channels.js";
import { hasStationPin, setStationPin, verifyStationPin } from "../src/services/settings.js";
import { db } from "../src/db.js";

function makeOwner(): number {
  return Number(
    db.prepare("INSERT INTO users (username, passwordHash, role) VALUES ('o','x','admin')").run().lastInsertRowid,
  );
}

describe("parental controls", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    resetDb();
    app = await makeApp();
  });
  afterEach(() => app.close());

  it("hashes and verifies the station PIN (and clears it)", async () => {
    expect(hasStationPin()).toBe(false);
    await setStationPin("2468");
    expect(hasStationPin()).toBe(true);
    // Stored value is a hash, not the PIN.
    const stored = db.prepare("SELECT value FROM settings WHERE key='station.pinHash'").get() as { value: string };
    expect(stored.value).not.toContain("2468");
    expect(await verifyStationPin("2468")).toBe(true);
    expect(await verifyStationPin("0000")).toBe(false);
    await setStationPin("");
    expect(hasStationPin()).toBe(false);
  });

  it("persists a channel's locked flag", () => {
    const owner = makeOwner();
    const ch = createChannel(owner, { number: 4, name: "Locked", onAir: true });
    expect(ch.locked).toBe(false);
    updateChannel(ch.id, { locked: true });
    expect(getById(ch.id)!.locked).toBe(true);
    updateChannel(ch.id, { locked: false });
    expect(getById(ch.id)!.locked).toBe(false);
  });

  it("verify-pin endpoint reports correctness", async () => {
    const cookie = await setupAdmin(app);
    await setStationPin("1357");
    const good = await inj(app, cookie, { method: "POST", url: "/api/tv/verify-pin", payload: { pin: "1357" } });
    expect(good.json()).toEqual({ ok: true });
    const bad = await inj(app, cookie, { method: "POST", url: "/api/tv/verify-pin", payload: { pin: "9999" } });
    expect(bad.json()).toEqual({ ok: false });
  });
});
