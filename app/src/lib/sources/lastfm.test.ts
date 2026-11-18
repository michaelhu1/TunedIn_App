import { describe, expect, it, vi } from "vitest";
import { createLastfmSource } from "./lastfm";
import { SourceError } from "./types";

const KEY = "secret-test-key";
const PLACEHOLDER = "https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png";

// Builds a raw Last.fm track object like the real API returns.
function rawTrack(opts: { name: string; artist?: string; album?: string; uts?: number; nowPlaying?: boolean; image?: string }) {
  return {
    name: opts.name,
    artist: { mbid: "", "#text": opts.artist ?? "Artist" },
    album: { mbid: "", "#text": opts.album ?? "" },
    image: ["small", "medium", "large", "extralarge"].map((size) => ({ size, "#text": opts.image ?? "" })),
    mbid: "",
    streamable: "0",
    url: "https://www.last.fm/music/x",
    ...(opts.nowPlaying ? { "@attr": { nowplaying: "true" } } : { date: { uts: String(opts.uts), "#text": "" } }),
  };
}

function page(track: unknown) {
  return { recenttracks: { track, "@attr": { user: "u", page: "1", perPage: "50", totalPages: "1", total: "1" } } };
}

/** A fake fetch that answers with fixed JSON (or text) and records the URLs it was called with. */
function fakeFetch(body: unknown, status = 200) {
  const fn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(text, { status });
  });
  return fn;
}

function source(fetchFn: ReturnType<typeof fakeFetch>) {
  return createLastfmSource({ apiKey: KEY, fetch: fetchFn as unknown as typeof fetch });
}

async function catchError(p: Promise<unknown>): Promise<SourceError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(SourceError);
    return err as SourceError;
  }
  throw new Error("expected a SourceError");
}

describe("getRecentListens", () => {
  it("builds the request URL with a trimmed, encoded username and timeout signal", async () => {
    const f = fakeFetch(page([]));
    await source(f).getRecentListens("  a b&c  ", { limit: 10, since: new Date(1_700_000_000_500) });
    const url = new URL(String(f.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe("https://ws.audioscrobbler.com/2.0/");
    expect(url.searchParams.get("user")).toBe("a b&c");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("from")).toBe("1700000000");
    expect(url.searchParams.get("method")).toBe("user.getrecenttracks");
    expect(url.searchParams.get("format")).toBe("json");
    expect(f.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("maps tracks, newest first, with now-playing first and separate from the matching scrobble", async () => {
    const f = fakeFetch(
      page([
        rawTrack({ name: "Song A", artist: "Band", album: "LP", nowPlaying: true, image: "https://img/a.png" }),
        rawTrack({ name: "Song A", artist: "Band", album: "LP", uts: 1_700_000_200, image: "https://img/a.png" }),
        rawTrack({ name: "Song B", uts: 1_700_000_100, image: PLACEHOLDER }),
      ]),
    );
    const listens = await source(f).getRecentListens("u", { limit: 2 });
    expect(listens).toEqual([
      { track: { artist: "Band", title: "Song A", album: "LP" }, playedAt: null, nowPlaying: true, artworkUrl: "https://img/a.png" },
      { track: { artist: "Band", title: "Song A", album: "LP" }, playedAt: new Date(1_700_000_200_000), nowPlaying: false, artworkUrl: "https://img/a.png" },
      // Empty album and placeholder art become undefined.
      { track: { artist: "Artist", title: "Song B", album: undefined }, playedAt: new Date(1_700_000_100_000), nowPlaying: false, artworkUrl: undefined },
    ]);
  });

  it("caps scrobbles at limit (now-playing is extra)", async () => {
    const f = fakeFetch(page([rawTrack({ name: "Now", nowPlaying: true }), rawTrack({ name: "1", uts: 3 }), rawTrack({ name: "2", uts: 2 })]));
    const listens = await source(f).getRecentListens("u", { limit: 1 });
    expect(listens.map((l) => l.track.title)).toEqual(["Now", "1"]);
  });

  it("handles a single track object instead of an array", async () => {
    const f = fakeFetch(page(rawTrack({ name: "Only", uts: 1_700_000_000 })));
    const listens = await source(f).getRecentListens("u", { limit: 1 });
    expect(listens).toHaveLength(1);
    expect(listens[0].track.title).toBe("Only");
  });

  it("returns [] for a user with no scrobbles", async () => {
    expect(await source(fakeFetch(page([]))).getRecentListens("u")).toEqual([]);
  });

  it("drops plays at or before `since` but keeps now-playing", async () => {
    const f = fakeFetch(page([rawTrack({ name: "Now", nowPlaying: true }), rawTrack({ name: "New", uts: 101 }), rawTrack({ name: "Same second", uts: 100 })]));
    const listens = await source(f).getRecentListens("u", { since: new Date(100_000) });
    expect(listens.map((l) => l.track.title)).toEqual(["Now", "New"]);
  });

  it("skips malformed tracks (no artist/title, or no date when not playing)", async () => {
    const noDate = { ...rawTrack({ name: "X", uts: 1 }), date: undefined };
    const f = fakeFetch(page([rawTrack({ name: "", uts: 5 }), rawTrack({ name: "Y", artist: "", uts: 4 }), noDate, rawTrack({ name: "Ok", uts: 3 })]));
    const listens = await source(f).getRecentListens("u");
    expect(listens.map((l) => l.track.title)).toEqual(["Ok"]);
  });

  it("clamps limit into 1..200", async () => {
    const f = fakeFetch(page([]));
    await source(f).getRecentListens("u", { limit: 5000 });
    await source(f).getRecentListens("u", { limit: 0 });
    expect(new URL(String(f.mock.calls[0][0])).searchParams.get("limit")).toBe("200");
    expect(new URL(String(f.mock.calls[1][0])).searchParams.get("limit")).toBe("1");
  });
});

describe("errors", () => {
  const cases: Array<[string, unknown, number, string]> = [
    ["error 6", { message: "User not found", error: 6 }, 404, "not_found"],
    ["error 17", { message: "Login: User required to be logged in", error: 17 }, 403, "private"],
    ["error 29", { message: "Rate Limit Exceeded", error: 29 }, 429, "rate_limited"],
    ["error 8", { message: "Operation failed", error: 8 }, 500, "unavailable"],
    ["error 11", { message: "Service Offline", error: 11 }, 503, "unavailable"],
    ["error 16", { message: "Temporary error", error: 16 }, 503, "unavailable"],
    ["error in a 200 body", { message: "User not found", error: 6 }, 200, "not_found"],
    ["HTTP 502 with HTML", "<html>Bad Gateway</html>", 502, "unavailable"],
    ["HTTP 429 with no JSON", "slow down", 429, "rate_limited"],
    ["200 with non-JSON", "not json", 200, "unavailable"],
    ["200 with wrong shape", { foo: 1 }, 200, "unavailable"],
  ];
  it.each(cases)("%s -> kind", async (_name, body, status, kind) => {
    const err = await catchError(source(fakeFetch(body, status)).getRecentListens("u"));
    expect(err.kind).toBe(kind);
    expect(err.source).toBe("lastfm");
  });

  it("invalid API key is unavailable with a clear message that does not leak the key", async () => {
    const err = await catchError(source(fakeFetch({ message: "Invalid API key", error: 10 }, 403)).getRecentListens("u"));
    expect(err.kind).toBe("unavailable");
    expect(err.message).toMatch(/API key is invalid/);
    expect(err.message).not.toContain(KEY);
  });

  it("network errors and timeouts are unavailable and do not leak the key", async () => {
    const boom = vi.fn(async () => {
      throw new TypeError(`fetch failed for https://x/?api_key=${KEY}`);
    });
    const timeout = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    const e1 = await catchError(createLastfmSource({ apiKey: KEY, fetch: boom as unknown as typeof fetch }).getRecentListens("u"));
    const e2 = await catchError(createLastfmSource({ apiKey: KEY, fetch: timeout as unknown as typeof fetch }).getRecentListens("u"));
    expect([e1.kind, e2.kind]).toEqual(["unavailable", "unavailable"]);
    expect(e2.message).toMatch(/timed out/);
    expect(e1.message + e2.message).not.toContain(KEY);
  });
});

describe("userExists", () => {
  it("uses limit=1 and returns true for a user with or without scrobbles", async () => {
    const f = fakeFetch(page([]));
    expect(await source(f).userExists(" someone ")).toBe(true);
    expect(new URL(String(f.mock.calls[0][0])).searchParams.get("limit")).toBe("1");
  });

  it("returns false for not_found and true for private", async () => {
    expect(await source(fakeFetch({ message: "User not found", error: 6 }, 404)).userExists("x")).toBe(false);
    expect(await source(fakeFetch({ message: "Login required", error: 17 }, 403)).userExists("x")).toBe(true);
  });

  it("rethrows rate_limited and unavailable", async () => {
    expect((await catchError(source(fakeFetch({ error: 29, message: "" }, 429)).userExists("x"))).kind).toBe("rate_limited");
    expect((await catchError(source(fakeFetch("oops", 500)).userExists("x"))).kind).toBe("unavailable");
  });
});
