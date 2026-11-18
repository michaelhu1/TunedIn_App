// iTunes Search API: our fallback metadata source. No key, but Apple limits it to
// roughly 20 requests per minute per IP, so the combiner only calls it when Deezer
// could not help. It has no ISRC.
//
// Live findings (Nov 2026): `previewUrl` and artwork URLs are plain, unsigned CDN URLs
// with long cache lifetimes, so they are safe to store. Over the limit Apple is
// reported to answer HTTP 403 (we also treat 429 that way).

import { lookupQuery, pickBestMatch } from "./match";
import { SourceError, type MetadataSource, type TrackMetadata, type TrackRef } from "./types";

const BASE = "https://itunes.apple.com/search";
const TIMEOUT_MS = 8000;
const LOOKUP_CANDIDATES = 25;
const ARTWORK_SIZE = 500;

/** The parts of an iTunes song result we use. */
type ItunesTrack = {
  wrapperType?: string;
  kind?: string;
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  trackExplicitness?: string; // "explicit" | "notExplicit" | "cleaned"
};

export function createItunesSource(
  opts: { fetch?: typeof fetch; country?: string } = {},
): MetadataSource {
  const doFetch = opts.fetch ?? fetch;
  const country = opts.country ?? "US";

  async function searchSongs(term: string, limit: number): Promise<ItunesTrack[]> {
    const params = new URLSearchParams({
      term,
      entity: "song",
      media: "music",
      limit: String(limit),
      country,
    });
    let res: Response;
    try {
      res = await doFetch(`${BASE}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      throw new SourceError("unavailable", `iTunes request failed: ${String(e)}`, "itunes");
    }
    if (res.status === 403 || res.status === 429) {
      throw new SourceError("rate_limited", `iTunes HTTP ${res.status}`, "itunes");
    }
    if (!res.ok) throw new SourceError("unavailable", `iTunes HTTP ${res.status}`, "itunes");

    let body: { results?: ItunesTrack[] };
    try {
      // Apple sends `text/javascript`, so parse the text ourselves.
      body = JSON.parse(await res.text());
    } catch {
      throw new SourceError("unavailable", "iTunes returned non-JSON", "itunes");
    }
    // Defensive: keep only songs (no music videos or podcasts).
    return (body.results ?? []).filter((r) => r.kind === "song");
  }

  return {
    id: "itunes",

    async search(query, limit = 10) {
      if (!query.trim()) return [];
      return (await searchSongs(query, limit)).map(toMetadata);
    },

    async lookup(ref: TrackRef) {
      const results = await searchSongs(lookupQuery(ref), LOOKUP_CANDIDATES);
      const best = pickBestMatch(ref, results, (t) => ({
        artist: t.artistName,
        title: t.trackName,
        album: t.collectionName,
        explicit: t.trackExplicitness === "explicit",
        clean: t.trackExplicitness === "cleaned",
      }));
      return best ? toMetadata(best) : null;
    },
  };
}

/** Apple serves any size from the same path: swap ".../100x100bb.jpg" for 500x500. */
export function upsizeArtwork(url: string | undefined, size = ARTWORK_SIZE): string | undefined {
  return url?.replace(/\/\d+x\d+bb\.(jpg|png|webp)$/, `/${size}x${size}bb.$1`);
}

function toMetadata(t: ItunesTrack): TrackMetadata {
  return {
    artist: t.artistName,
    title: t.trackName,
    album: t.collectionName,
    artworkUrl: upsizeArtwork(t.artworkUrl100),
    previewUrl: t.previewUrl || undefined,
    durationMs: t.trackTimeMillis,
    itunesId: t.trackId,
  };
}
