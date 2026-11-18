// Last.fm adapter: reads a user's public scrobble history via user.getRecentTracks.
// Docs: https://www.last.fm/api/show/user.getRecentTracks

import { type Listen, type ListeningSource, SourceError, type SourceErrorKind } from "./types";

const API_URL = "https://ws.audioscrobbler.com/2.0/";
const SOURCE_ID = "lastfm";
const TIMEOUT_MS = 8_000;
const MAX_LIMIT = 200; // Last.fm's per-page maximum for this method.

// Last.fm serves this grey star image when an album has no art. Treat it as "no artwork".
const PLACEHOLDER_IMAGE_ID = "2a96cbd8b46e442fc41c2b86b821562f";

// --- Raw response shapes (only the fields we read) ---

type RawText = { "#text"?: string };
type RawTrack = {
  name?: string;
  artist?: RawText;
  album?: RawText;
  image?: Array<{ size?: string; "#text"?: string }>;
  date?: { uts?: string };
  "@attr"?: { nowplaying?: string };
};
type RawResponse = {
  recenttracks?: { track?: RawTrack | RawTrack[] };
  error?: number;
  message?: string;
};

// Last.fm error code -> our error kind. Anything not listed is "unavailable".
const ERROR_KINDS: Record<number, SourceErrorKind> = {
  6: "not_found", // user not found
  17: "private", // login required: the user hides their recent tracks
  29: "rate_limited",
};

export function createLastfmSource(opts: { apiKey: string; fetch?: typeof fetch }): ListeningSource {
  const doFetch = opts.fetch ?? fetch;

  /** Calls user.getRecentTracks and returns the raw track list, or throws SourceError. */
  async function fetchRecentTracks(username: string, limit: number, from?: number): Promise<RawTrack[]> {
    const params = new URLSearchParams({
      method: "user.getrecenttracks",
      user: username.trim(),
      limit: String(limit),
      format: "json",
      api_key: opts.apiKey,
    });
    if (from !== undefined) params.set("from", String(from));

    let res: Response;
    try {
      res = await doFetch(`${API_URL}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      // Network failure or timeout. Do not include the URL: it contains the API key.
      const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "network error";
      throw fail("unavailable", `Last.fm request ${reason}`);
    }

    // Last.fm reports errors as a JSON body {error, message}, usually with a 4xx status
    // (verified: unknown user -> 404, bad API key -> 403). We read the body first and
    // trust its error code over the HTTP status.
    let body: RawResponse | undefined;
    try {
      body = (await res.json()) as RawResponse;
    } catch {
      body = undefined; // e.g. an HTML error page from a proxy during an outage
    }

    if (body && typeof body.error === "number") {
      const kind = ERROR_KINDS[body.error] ?? "unavailable";
      const message =
        body.error === 10 ? "Last.fm API key is invalid" : `Last.fm error ${body.error}: ${body.message ?? "unknown"}`;
      throw fail(kind, message);
    }
    if (!res.ok) {
      throw fail(res.status === 429 ? "rate_limited" : "unavailable", `Last.fm HTTP ${res.status}`);
    }
    if (!body || !body.recenttracks) {
      throw fail("unavailable", "Last.fm returned an unexpected response");
    }

    // Quirk: Last.fm may return a single object instead of a one-element array.
    const tracks = body.recenttracks.track;
    if (!tracks) return [];
    return Array.isArray(tracks) ? tracks : [tracks];
  }

  return {
    id: SOURCE_ID,

    async getRecentListens(username, { limit = 50, since } = {}) {
      const n = Math.min(Math.max(Math.floor(limit), 1), MAX_LIMIT);
      // `from` is in whole seconds. We round down and filter precisely below, so a play
      // in the same second as `since` is never sent twice.
      const from = since ? Math.floor(since.getTime() / 1000) : undefined;
      const raw = await fetchRecentTracks(username, n, from);

      const listens = raw.map(toListen).filter((l): l is Listen => l !== null);

      // Now-playing handling. Last.fm returns `limit` scrobbles PLUS the now-playing
      // track on top, and that same song often also shows up as the latest scrobble
      // (e.g. it was scrobbled and is still playing, or is on repeat).
      // We keep them separate rather than de-duplicating:
      //   - the now-playing entry is "what they are listening to right now" (no time),
      //   - scrobbles are the history (each one a real, completed, timestamped play).
      // Guessing that two entries are "the same play" would lose legitimate repeat
      // listens, so callers that build history should simply skip `nowPlaying` entries.
      // `limit` therefore counts scrobbles; the result may have limit + 1 items.
      const nowPlaying = listens.find((l) => l.nowPlaying);
      const played = listens
        .filter((l) => !l.nowPlaying && (!since || (l.playedAt && l.playedAt > since)))
        .slice(0, n);
      return nowPlaying ? [nowPlaying, ...played] : played;
    },

    async userExists(username) {
      try {
        await fetchRecentTracks(username, 1);
        return true;
      } catch (err) {
        if (err instanceof SourceError && err.kind === "not_found") return false;
        if (err instanceof SourceError && err.kind === "private") return true; // exists, just hidden
        throw err;
      }
    },
  };
}

function fail(kind: SourceErrorKind, message: string): SourceError {
  return new SourceError(kind, message, SOURCE_ID);
}

/** Empty strings from Last.fm become undefined. */
function text(value: string | undefined): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

/** Converts one raw track to a Listen, or null if it is missing an artist or title. */
function toListen(t: RawTrack): Listen | null {
  const artist = text(t.artist?.["#text"]);
  const title = text(t.name);
  if (!artist || !title) return null;

  const nowPlaying = t["@attr"]?.nowplaying === "true";
  const uts = Number(t.date?.uts);
  // `date.uts` is unix seconds. A now-playing track has no date.
  const playedAt = !nowPlaying && Number.isFinite(uts) && uts > 0 ? new Date(uts * 1000) : null;
  // A non-now-playing track without a usable date is malformed; drop it.
  if (!nowPlaying && !playedAt) return null;

  return {
    track: { artist, title, album: text(t.album?.["#text"]) },
    playedAt,
    nowPlaying,
    artworkUrl: pickArtwork(t.image),
  };
}

/** Largest image Last.fm offers (the list goes small -> extralarge), ignoring the placeholder. */
function pickArtwork(images: RawTrack["image"]): string | undefined {
  const url = text(images?.at(-1)?.["#text"]);
  return url && !url.includes(PLACEHOLDER_IMAGE_ID) ? url : undefined;
}
