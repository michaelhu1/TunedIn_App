import { describe, expect, it, vi } from "vitest";
import { AppleMusicAuthError, countNewPlays, estimatePlayTimes, getRecentlyPlayed } from "./apple-music";
import { SourceError } from "./types";

const TOKENS = { developerToken: "dev-token", musicUserToken: "user-token" };

function fakeFetch(body: unknown, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
}
const call = (f: ReturnType<typeof fakeFetch>) => getRecentlyPlayed(TOKENS, { fetch: f as unknown as typeof fetch });

// A song the way Apple's "recently played tracks" returns it (trimmed to what we read).
const song = (id: string, name: string, artistName: string, extra: Record<string, unknown> = {}) => ({
  id, type: "songs", attributes: { name, artistName, albumName: "Album", durationInMillis: 200_000, ...extra },
});

describe("getRecentlyPlayed", () => {
  it("sends both tokens and asks for the full list", async () => {
    const f = fakeFetch({ data: [] });
    await call(f);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe("https://api.music.apple.com/v1/me/recent/played/tracks?limit=30&types=songs,library-songs");
    expect(init?.headers).toEqual({ Authorization: "Bearer dev-token", "Music-User-Token": "user-token" });
  });

  it("maps songs, newest first, and skips anything without a title and artist", async () => {
    const f = fakeFetch({
      data: [
        song("1", "Efecto", "Bad Bunny", { albumName: "Un Verano Sin Ti", durationInMillis: 213061 }),
        { id: "2", type: "songs", attributes: { name: "No artist" } },
        { id: "3", type: "songs" },
        song("i.abc", "Uploaded", "Me", { albumName: "", durationInMillis: undefined }),
      ],
    });
    expect(await call(f)).toEqual([
      { id: "1", title: "Efecto", artist: "Bad Bunny", album: "Un Verano Sin Ti", durationMs: 213061 },
      { id: "i.abc", title: "Uploaded", artist: "Me", album: undefined, durationMs: undefined },
    ]);
  });

  it("treats 403 as the person's token being refused", async () => {
    await expect(call(fakeFetch({ errors: [] }, 403))).rejects.toBeInstanceOf(AppleMusicAuthError);
  });

  it("treats 401 (our own token) and 5xx as unavailable, and 429 as rate limited", async () => {
    for (const [status, kind] of [[401, "unavailable"], [500, "unavailable"], [429, "rate_limited"]] as const) {
      const err = await call(fakeFetch({}, status)).catch((e) => e);
      expect(err).toBeInstanceOf(SourceError);
      expect((err as SourceError).kind).toBe(kind);
    }
  });

  it("reports a network failure or unreadable answer as unavailable", async () => {
    const down = vi.fn(async () => { throw new Error("offline"); });
    for (const p of [getRecentlyPlayed(TOKENS, { fetch: down as unknown as typeof fetch }), call(fakeFetch("<html>"))]) {
      const err = await p.catch((e) => e);
      expect((err as SourceError).kind).toBe("unavailable");
    }
  });
});

describe("countNewPlays", () => {
  const n = (prev: string, cur: string) => countNewPlays(prev.split(""), cur.split(""));

  it("finds nothing new in an unchanged list", () => expect(n("ABC", "ABC")).toBe(0));
  it("counts songs added at the top", () => expect(n("ABC", "XYABC")).toBe(2));
  it("copes with the old end falling off a full list", () => expect(n("ABCD", "XYAB")).toBe(2));
  it("counts a repeat listed twice", () => expect(n("ABC", "BABC")).toBe(1));
  it("counts a repeat moved to the top", () => expect(n("ABC", "BAC")).toBe(1));
  it("counts back-to-back repeats of the newest song", () => expect(n("ABC", "AABC")).toBe(1));
  it("counts new songs mixed with a moved repeat", () => expect(n("ABCD", "XCABD")).toBe(2));
  it("counts everything when nothing lines up", () => expect(n("ABC", "XYZ")).toBe(3));
  it("counts everything after an empty list", () => expect(n("", "AB")).toBe(2));
  it("handles an empty reading", () => expect(n("ABC", "")).toBe(0));
  it("does not invent plays when a song vanishes from the list", () => expect(n("ABC", "AC")).toBe(0));
});

describe("estimatePlayTimes", () => {
  const NOW = new Date("2026-11-24T12:00:00Z");
  const before = (ms: number) => new Date(NOW.getTime() - ms);
  const MIN = 60_000;

  it("returns nothing for nothing", () => expect(estimatePlayTimes([], before(MIN), NOW)).toEqual([]));

  it("dates a single new song at the time of the look when looks are close together", () => {
    expect(estimatePlayTimes([200_000], before(MIN), NOW)).toEqual([NOW]);
  });

  it("steps back one song length at a time", () => {
    const times = estimatePlayTimes([120_000, 180_000, 240_000], before(9 * MIN), NOW);
    expect(times).toEqual([NOW, before(120_000), before(300_000)]);
  });

  it("assumes three minutes for a song with no known length", () => {
    expect(estimatePlayTimes([undefined, 100_000], before(9 * MIN), NOW)[1]).toEqual(before(180_000));
  });

  it("shares out the gap when more songs were played than fit in it", () => {
    const times = estimatePlayTimes([200_000, 200_000, 200_000], before(MIN), NOW);
    expect(times).toEqual([NOW, before(20_000), before(40_000)]);
  });

  it("spreads plays across a long gap instead of claiming they just happened", () => {
    const times = estimatePlayTimes([200_000, 200_000, 200_000], before(4 * 60 * MIN), NOW);
    expect(times).toEqual([before(60 * MIN), before(120 * MIN), before(180 * MIN)]);
  });

  it("always returns distinct times, newest first, after the previous look and not in the future", () => {
    for (const gap of [0, 1, 500, MIN, 10 * MIN, 10 * MIN + 1, 3 * 86_400_000]) {
      for (const count of [1, 2, 30]) {
        const prev = before(gap);
        const times = estimatePlayTimes(Array(count).fill(undefined), prev, NOW).map((t) => t.getTime());
        expect(times).toHaveLength(count);
        for (let i = 0; i < count; i++) {
          expect(times[i]).toBeLessThanOrEqual(NOW.getTime());
          if (gap > count) expect(times[i]).toBeGreaterThan(prev.getTime());
          if (i > 0) expect(times[i]).toBeLessThan(times[i - 1]);
        }
      }
    }
  });
});
