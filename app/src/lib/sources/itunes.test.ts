import { describe, expect, it } from "vitest";
import { createItunesSource, upsizeArtwork } from "./itunes";
import { SourceError } from "./types";

const ART = "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/57/e8/7b/57e87ba0/24UMGIM55213.rgb.jpg/100x100bb.jpg";

// Trimmed from a real search for "sabrina carpenter espresso" (Nov 2026): the top hit is
// an alternate version, which lookup must skip.
const ESPRESSO = {
  resultCount: 3,
  results: [
    { kind: "song", trackId: 1746801012, trackName: "Espresso (On Vacation Version)", artistName: "Sabrina Carpenter", collectionName: "Espresso EP", artworkUrl100: ART, trackTimeMillis: 175459, trackExplicitness: "notExplicit" },
    { kind: "music-video", trackId: 1, trackName: "Espresso", artistName: "Sabrina Carpenter" },
    { kind: "song", trackId: 1750307020, trackName: "Espresso", artistName: "Sabrina Carpenter", collectionName: "Short n' Sweet", artworkUrl100: ART, previewUrl: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/x.m4a", trackTimeMillis: 175459, trackExplicitness: "cleaned" },
  ],
};

function fakeFetch(respond: () => Response | Promise<Response>) {
  const urls: string[] = [];
  const f = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return respond();
  }) as typeof fetch;
  return { f, urls };
}
// Apple really does send JSON as text/javascript.
const body = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "text/javascript" } });

describe("itunes lookup", () => {
  it("skips the alternate version and the music video, and upsizes the artwork", async () => {
    const { f, urls } = fakeFetch(() => body(ESPRESSO));
    const r = await createItunesSource({ fetch: f, country: "GB" }).lookup({ artist: "Sabrina Carpenter", title: "Espresso" });
    const url = new URL(urls[0]);
    expect(url.searchParams.get("term")).toBe("sabrina carpenter espresso");
    expect(url.searchParams.get("entity")).toBe("song");
    expect(url.searchParams.get("country")).toBe("GB");
    expect(r).toMatchObject({
      itunesId: 1750307020,
      album: "Short n' Sweet",
      durationMs: 175459,
      artworkUrl: expect.stringMatching(/\/500x500bb\.jpg$/),
      previewUrl: expect.stringContaining("AudioPreview"),
    });
    expect(r?.isrc).toBeUndefined();
  });

  it("returns null when nothing matches", async () => {
    const { f } = fakeFetch(() => body({ resultCount: 0, results: [] }));
    expect(await createItunesSource({ fetch: f }).lookup({ artist: "Nobody", title: "Nothing" })).toBeNull();
  });
});

describe("itunes errors", () => {
  const kind = async (respond: () => Response | Promise<Response>) => {
    const e = await createItunesSource({ fetch: fakeFetch(respond).f }).search("x").catch((x) => x);
    expect(e).toBeInstanceOf(SourceError);
    return (e as SourceError).kind;
  };
  it("maps 403 and 429 to rate_limited", async () => {
    expect(await kind(() => new Response("", { status: 403 }))).toBe("rate_limited");
    expect(await kind(() => new Response("", { status: 429 }))).toBe("rate_limited");
  });
  it("maps 5xx, non-JSON and network failures to unavailable", async () => {
    expect(await kind(() => new Response("", { status: 503 }))).toBe("unavailable");
    expect(await kind(() => new Response("not json"))).toBe("unavailable");
    expect(await kind(() => Promise.reject(new DOMException("timed out", "TimeoutError")))).toBe("unavailable");
  });
});

describe("upsizeArtwork", () => {
  it("rewrites only the size segment", () => {
    expect(upsizeArtwork(ART)).toBe(ART.replace("100x100bb", "500x500bb"));
    expect(upsizeArtwork(undefined)).toBeUndefined();
  });
});
