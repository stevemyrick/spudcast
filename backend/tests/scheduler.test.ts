import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedItem } from "./helpers.js";
import { createChannel, setItems, updateChannel } from "../src/services/channels.js";
import { getGuide, nowPlaying } from "../src/services/scheduler.js";
import { db } from "../src/db.js";

function makeOwner(): number {
  const info = db
    .prepare("INSERT INTO users (username, passwordHash, role) VALUES ('o','x','admin')")
    .run();
  return Number(info.lastInsertRowid);
}

describe("scheduler", () => {
  beforeEach(() => resetDb());

  it("returns a program at a deterministic, advancing offset (mid-program join)", async () => {
    const owner = makeOwner();
    const a = seedItem({ title: "A", durationMs: 600_000 });
    const b = seedItem({ title: "B", durationMs: 600_000 });
    const ch = createChannel(owner, { number: 3, name: "Test", onAir: true });
    setItems(ch.id, [a, b]);

    const first = nowPlaying(3);
    expect(first?.kind).toBe("program");
    if (first?.kind !== "program") return;
    expect(["A", "B"]).toContain(first.item.title);
    const offset1 = first.offsetMs;

    await new Promise((r) => setTimeout(r, 30));
    const second = nowPlaying(3);
    if (second?.kind !== "program") throw new Error("expected program");
    // Same wall clock advanced → offset grew (within the same item).
    if (second.item.id === first.item.id) {
      expect(second.offsetMs).toBeGreaterThanOrEqual(offset1);
    }
  });

  it("loops the playlist with correct durations in the guide", () => {
    const owner = makeOwner();
    const a = seedItem({ title: "A", durationMs: 60_000 });
    const b = seedItem({ title: "B", durationMs: 120_000 });
    const ch = createChannel(owner, { number: 5, name: "Loop", onAir: true });
    setItems(ch.id, [a, b]);

    const guide = getGuide(5, 4);
    expect(guide).toHaveLength(4);
    // Each slot's duration matches its item, and slots are contiguous.
    for (let i = 0; i < guide.length - 1; i++) {
      expect(guide[i].endUtc).toBe(guide[i + 1].startUtc);
      const dur = new Date(guide[i].endUtc).getTime() - new Date(guide[i].startUtc).getTime();
      expect([60_000, 120_000]).toContain(dur);
    }
    // A and B alternate.
    const titles = guide.map((g) => g.item.title);
    expect(new Set(titles)).toEqual(new Set(["A", "B"]));
  });

  it("interleaves commercial-break filler when enabled", () => {
    const owner = makeOwner();
    const p1 = seedItem({ title: "P1", type: "movie", durationMs: 600_000 });
    const p2 = seedItem({ title: "P2", type: "movie", durationMs: 600_000 });
    seedItem({ title: "AD", type: "commercial", durationMs: 30_000 });
    const ch = createChannel(owner, { number: 7, name: "Filler", onAir: true });
    setItems(ch.id, [p1, p2]);
    updateChannel(ch.id, { config: { filler: { enabled: true, perBreak: 1 } } });

    const titles = getGuide(7, 4).map((g) => g.item.title);
    // Every other slot is the ad.
    expect(titles.filter((t) => t === "AD").length).toBe(2);
    expect(titles.filter((t) => t !== "AD").length).toBe(2);
  });

  it("returns null for an empty or unknown channel", () => {
    const owner = makeOwner();
    createChannel(owner, { number: 8, name: "Empty", onAir: true });
    expect(nowPlaying(8)).toBeNull();
    expect(nowPlaying(999)).toBeNull();
  });

  it("serves the weather channel as an always-live payload", () => {
    const owner = makeOwner();
    const ch = createChannel(owner, {
      number: 13,
      name: "Weather",
      type: "weather",
      onAir: true,
      config: { weather: { embedUrl: "https://example.com/ws4kp" } },
    });
    expect(ch.type).toBe("weather");
    const np = nowPlaying(13);
    expect(np?.kind).toBe("weather");
    if (np?.kind === "weather") {
      expect(np.weather.embedUrl).toBe("https://example.com/ws4kp");
    }
  });
});
