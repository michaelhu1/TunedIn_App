import { describe, expect, it } from "vitest";
import { createDeezerSource } from "./deezer";
import { SourceError } from "./types";

// Trimmed from a real /search?q=sabrina%20carpenter%20espresso response (Nov 2026).
const ESPRESSO = {
  data: [
    {
      id: 2826194232,
      title: "Espresso (Mark Ronson x FNZ Working Late Remix)",
      isrc: "USUM72406245",
      duration: 184,
      preview: "https://cdnt-preview.dzcdn.net/api/1/1/f/0/f/0/f0fb.mp3?hdnea=exp=1795017059~hmac=x",
      explicit_lyrics: true,
      artist: { name: "Sabrina Carpenter" },
      album: { title: "Espresso (Working Late Remixes)", cover_big: "https://cdn-images.dzcdn.net/images/cover/24ea/500x500-000000-80-0-0.jpg" },
    },
    {
      id: 2743578151,
      title: "Espresso",
      isrc: "USUM72403305",
      duration: 175,
      preview: "https://cdnt-preview.dzcdn.net/api/1/1/1/7/a/0/17a2.mp3?hdnea=exp=1795017059~hmac=y",
      explicit_lyrics: true,
      artist: { name: "Sabrina Carpenter" },
      album: { title: "Espresso", cover_big: "https://cdn-images.dzcdn.net/images/cover/e322/500x500-000000-80-0-0.jpg" },
    },
  ],
};

/** A fake fetch that records the URLs it was asked for. */
function fakeFetch(respond: () => Response | Promise<Response>) {
  const urls: string[] = [];
  const f = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return respond();
  }) as typeof fetch;
  return { f, urls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

async function errorKind(p: Promise<unknown>) {
  const e = await p.catch((x) => x);
  expect(e).toBeInstanceOf(SourceError);
  return (e as SourceError).kind;
}

describe("deezer lookup", () => {
  it("makes one plain search and returns the matching track's details", async () => {
    const { f, urls } = fakeFetch(() => json(ESPRESSO));
    const r = await createDeezerSource({ fetch: f }).lookup({ artist: "Sabrina Carpenter", title: "Espresso" });
    expect(urls).toEqual(["https://api.deezer.com/search?q=sabrina%20carpenter%20espresso&limit=25"]);
    expect(r).toMatchObject({
      artist: "Sabrina Carpenter",
      title: "Espresso",
      isrc: "USUM72403305",
      deezerId: 2743578151,
      durationMs: 175000,
      artworkUrl: expect.stringContaining("500x500"),
      previewUrl: expect.stringContaining("hdnea"),
    });
  });

  it("returns null when nothing matches", async () => {
    const { f } = fakeFetch(() => json({ data: [], total: 0 }));
    expect(await createDeezerSource({ fetch: f }).lookup({ artist: "Qwzxv", title: "Glarfen" })).toBeNull();
  });
});

describe("deezer search", () => {
  it("maps results in Deezer's order", async () => {
    const { f, urls } = fakeFetch(() => json(ESPRESSO));
    const r = await createDeezerSource({ fetch: f }).search("espresso", 5);
    expect(urls[0]).toContain("limit=5");
    expect(r.map((t) => t.deezerId)).toEqual([2826194232, 2743578151]);
  });
});

describe("deezer errors", () => {
  const run = (respond: () => Response | Promise<Response>) =>
    createDeezerSource({ fetch: fakeFetch(respond).f }).search("x");

  it("maps the in-body quota error to rate_limited", async () => {
    expect(await errorKind(run(() => json({ error: { type: "Exception", message: "Quota limit exceeded", code: 4 } })))).toBe(
      "rate_limited",
    );
  });
  it("maps other in-body errors, 5xx, non-JSON and network failures to unavailable", async () => {
    expect(await errorKind(run(() => json({ error: { type: "DataException", message: "no data", code: 800 } })))).toBe(
      "unavailable",
    );
    expect(await errorKind(run(() => new Response("oops", { status: 502 })))).toBe("unavailable");
    expect(await errorKind(run(() => new Response("<html>", { status: 200 })))).toBe("unavailable");
    expect(await errorKind(run(() => Promise.reject(new TypeError("fetch failed"))))).toBe("unavailable");
  });
});
