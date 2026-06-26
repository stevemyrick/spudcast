import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedItem } from "./helpers.js";
import { mapJellyfinItem, queryByRules } from "../src/services/library.js";

describe("library mapping", () => {
  it("maps a Jellyfin movie (ticks → ms, year, genres)", () => {
    const mapped = mapJellyfinItem({
      Id: "abc123",
      Name: "Ghostbusters",
      Type: "Movie",
      RunTimeTicks: 63_000_000_000, // 6300s = 105 min
      ProductionYear: 1984,
      Genres: ["Comedy", "Fantasy"],
    } as never);
    expect(mapped.durationMs).toBe(6_300_000);
    expect(mapped.year).toBe(1984);
    expect(mapped.type).toBe("movie");
    expect(mapped.source).toBe("jellyfin");
    expect(mapped.streamRef).toBe("abc123");
    expect(mapped.genres).toEqual(["Comedy", "Fantasy"]);
  });

  it("labels an episode with its series name", () => {
    const mapped = mapJellyfinItem({
      Id: "ep1",
      Name: "Pilot",
      Type: "Episode",
      SeriesName: "Cheers",
      RunTimeTicks: 14_400_000_000,
    } as never);
    expect(mapped.type).toBe("episode");
    expect(mapped.title).toBe("Cheers — Pilot");
  });
});

describe("auto-channel rules", () => {
  beforeEach(() => resetDb());

  it("filters by genre, decade, and type (ANDed)", () => {
    seedItem({ title: "Ghostbusters", type: "movie", year: 1984, genres: ["Comedy", "Fantasy"] });
    seedItem({ title: "The Terminator", type: "movie", year: 1984, genres: ["Sci-Fi", "Action"] });
    seedItem({ title: "Cheers", type: "episode", year: 1982, genres: ["Comedy"] });
    seedItem({ title: "Modern Comedy", type: "movie", year: 2015, genres: ["Comedy"] });

    expect(queryByRules({ genres: ["Sci-Fi"] }).map((i) => i.title)).toEqual(["The Terminator"]);

    const eighties = queryByRules({ yearFrom: 1980, yearTo: 1989 }).map((i) => i.title);
    expect(eighties.sort()).toEqual(["Cheers", "Ghostbusters", "The Terminator"]);

    const eightiesComedyMovies = queryByRules({
      genres: ["Comedy"],
      yearFrom: 1980,
      yearTo: 1989,
      types: ["movie"],
    }).map((i) => i.title);
    expect(eightiesComedyMovies).toEqual(["Ghostbusters"]); // excludes the episode + 2015 film
  });

  it("respects the limit", () => {
    for (let i = 0; i < 5; i++) seedItem({ title: `M${i}`, type: "movie", year: 1990 });
    expect(queryByRules({ limit: 3 })).toHaveLength(3);
  });

  it("survives a non-numeric limit (no 'LIMIT NaN' SQL error)", () => {
    for (let i = 0; i < 3; i++) seedItem({ title: `M${i}` });
    // The preview endpoint forwards unvalidated rules.
    expect(() => queryByRules({ limit: "abc" as unknown as number })).not.toThrow();
    expect(queryByRules({ limit: "abc" as unknown as number })).toHaveLength(3);
  });
});
