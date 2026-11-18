// Deezer: our primary metadata source. Free, no API key, and its search results already
// include the ISRC, the 30-second preview and the album cover, so one request per lookup
// is enough.
//
// Things learned from the live API (Nov 2026):
// - The "advanced" syntax `artist:"x" track:"y"` returns an empty list for artist
//   filters, so we send a plain `artist title` query and do the matching ourselves.
// - `preview` is a signed CDN URL (`?hdnea=exp=...`) that expires about 15 minutes after
//   the request. Do not store it long-term; re-fetch the track when you need to play it.
//   The cover image URLs are not signed and are safe to store.
// - Errors, including the rate limit, come back as HTTP 200 with an `error` object.

import { pickBestMatch, lookupQuery } from "./match";
import { SourceError, type MetadataSource, type TrackMetadata, type TrackRef } from "./types";

const BASE = "https://api.deezer.com";
const TIMEOUT_MS = 8000;
const LOOKUP_CANDIDATES = 25;

/** The parts of a Deezer track object we use. */
type DeezerTrack = {
  id: number;
  title: string;
  isrc?: string;
  duration?: number; // seconds
  preview?: string;
  explicit_lyrics?: boolean;
  artist: { name: string };
  album: { title: string; cover_big?: string; cover_medium?: string };
};

type DeezerSearchResponse = {
  data?: DeezerTrack[];
  error?: { type?: string; message?: string; code?: number };
};

export function createDeezerSource(opts: { fetch?: typeof fetch } = {}): MetadataSource {
  const doFetch = opts.fetch ?? fetch;

  async function searchTracks(q: string, limit: number): Promise<DeezerTrack[]> {
    const url = `${BASE}/search?q=${encodeURIComponent(q)}&limit=${limit}`;
    let res: Response;
    try {
      res = await doFetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      // Network failure or our timeout firing.
      throw new SourceError("unavailable", `Deezer request failed: ${String(e)}`, "deezer");
    }
    // Deezer normally reports quota errors in the body (below); 429 is here just in case.
    if (res.status === 429) {
      throw new SourceError("rate_limited", `Deezer HTTP ${res.status}`, "deezer");
    }
    if (!res.ok) throw new SourceError("unavailable", `Deezer HTTP ${res.status}`, "deezer");

    let body: DeezerSearchResponse;
    try {
      body = (await res.json()) as DeezerSearchResponse;
    } catch {
      throw new SourceError("unavailable", "Deezer returned non-JSON", "deezer");
    }
    if (body.error) {
      // Code 4 is "Quota limit exceeded" (documented limit: 50 requests / 5 seconds).
      const kind = body.error.code === 4 ? "rate_limited" : "unavailable";
      throw new SourceError(kind, `Deezer error: ${body.error.message ?? "unknown"}`, "deezer");
    }
    return body.data ?? [];
  }

  return {
    id: "deezer",

    async search(query, limit = 10) {
      if (!query.trim()) return [];
      return (await searchTracks(query, limit)).map(toMetadata);
    },

    async lookup(ref: TrackRef) {
      const results = await searchTracks(lookupQuery(ref), LOOKUP_CANDIDATES);
      const best = pickBestMatch(ref, results, (t) => ({
        artist: t.artist.name,
        title: t.title,
        album: t.album.title,
        explicit: t.explicit_lyrics,
      }));
      return best ? toMetadata(best) : null;
    },
  };
}

function toMetadata(t: DeezerTrack): TrackMetadata {
  return {
    artist: t.artist.name,
    title: t.title,
    album: t.album.title,
    isrc: t.isrc || undefined,
    // cover_big is 500x500, a good size for a phone. cover_xl (1000px) is overkill.
    artworkUrl: t.album.cover_big || t.album.cover_medium || undefined,
    previewUrl: t.preview || undefined,
    durationMs: t.duration ? t.duration * 1000 : undefined,
    deezerId: t.id,
  };
}
