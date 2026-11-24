// Apple Music, as a source of plays.
//
// What Apple offers is thinner than Last.fm: one list, "recently played tracks", newest
// first, at most 30 long, with NO play times and no "playing right now". So instead of
// asking "what was played since 3pm" we keep the list as it looked last time and compare:
// whatever is new at the top was played in between. `countNewPlays` and `estimatePlayTimes`
// below are that comparison, kept free of network code so they can be tested on their own.
//
// Asking needs two tokens: the app's developer token (apple-music-token.ts) and the
// person's Music User Token, which they grant in Apple's sign-in window. On the web that
// window comes from MusicKit JS; the native app will get the same kind of token from
// MusicKit on iOS and send it to the same endpoint, so nothing here is web-specific.

import { SourceError } from "./types";

const API = "https://api.music.apple.com/v1";
const SOURCE_ID = "apple-music";

/** Apple's maximum for this list. */
export const RECENT_LIMIT = 30;

export type AppleTrack = {
  /** Apple's id for the song. Used only to compare one reading of the list with the next. */
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
};

type RawResource = {
  id?: unknown;
  attributes?: { name?: unknown; artistName?: unknown; albumName?: unknown; durationInMillis?: unknown };
};

/** Thrown when Apple refuses the person's token: it expired, was revoked, or the subscription ended. */
export class AppleMusicAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppleMusicAuthError";
  }
}

/**
 * The person's recently played songs, newest first.
 * Throws AppleMusicAuthError if their token is no longer accepted, and SourceError
 * (rate_limited / unavailable) for everything else.
 */
export async function getRecentlyPlayed(
  tokens: { developerToken: string; musicUserToken: string },
  opts: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<AppleTrack[]> {
  const doFetch = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${API}/me/recent/played/tracks?limit=${RECENT_LIMIT}&types=songs,library-songs`, {
      headers: { Authorization: `Bearer ${tokens.developerToken}`, "Music-User-Token": tokens.musicUserToken },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      cache: "no-store",
    });
  } catch {
    throw new SourceError("unavailable", "Apple Music did not answer.", SOURCE_ID);
  }
  // 403 is about the listener's token. 401 is about OUR developer token (a wrong key or
  // team id), which is a setup fault, not a reason to tell anyone to reconnect.
  if (res.status === 403) throw new AppleMusicAuthError("Apple Music no longer accepts this person's token.");
  if (res.status === 429) throw new SourceError("rate_limited", "Apple Music is rate limiting us.", SOURCE_ID);
  if (!res.ok) throw new SourceError("unavailable", `Apple Music answered ${res.status}.`, SOURCE_ID);

  let body: { data?: RawResource[] };
  try {
    body = (await res.json()) as { data?: RawResource[] };
  } catch {
    throw new SourceError("unavailable", "Apple Music sent something unreadable.", SOURCE_ID);
  }
  const tracks: AppleTrack[] = [];
  for (const item of Array.isArray(body.data) ? body.data : []) {
    const a = item.attributes;
    if (typeof item.id !== "string" || typeof a?.name !== "string" || typeof a.artistName !== "string") continue;
    if (!a.name.trim() || !a.artistName.trim()) continue;
    tracks.push({
      id: item.id,
      title: a.name,
      artist: a.artistName,
      album: typeof a.albumName === "string" && a.albumName ? a.albumName : undefined,
      durationMs: typeof a.durationInMillis === "number" && a.durationInMillis > 0 ? a.durationInMillis : undefined,
    });
  }
  return tracks;
}

/** True if `needle` appears in `haystack` in the same order, not necessarily side by side. */
function isSubsequence(needle: string[], haystack: string[]): boolean {
  let i = 0;
  for (const h of haystack) {
    if (i < needle.length && needle[i] === h) i++;
  }
  return i === needle.length;
}

/**
 * How many songs at the top of `current` are new since `previous` (both newest first).
 *
 * New plays push the old list down, so the answer is the smallest number of songs to drop
 * from the top of `current` such that the rest is the old list. "Is the old list" is
 * checked loosely (same songs in the same order, gaps allowed) because when a song already
 * on the list is played again, Apple may move it to the top instead of listing it twice.
 *
 * If nothing lines up, all of `current` counts as new: the person played a full list's
 * worth since the last look.
 */
export function countNewPlays(previous: string[], current: string[]): number {
  for (let k = 0; k < current.length; k++) {
    if (isSubsequence(current.slice(k), previous)) return k;
  }
  return current.length;
}

const NEAR_REAL_TIME_MS = 10 * 60_000;
const TYPICAL_SONG_MS = 3 * 60_000;

/**
 * Best-guess play times for `durationsMs.length` new plays (newest first), found by a look
 * at `now` when the look before it was at `previousLookAt`. Apple does not say when a song
 * was played, only that it was after the previous look.
 *
 *   * Looks close together (the usual case, about a minute apart): the newest song is
 *     playing or just ended, so it gets `now`, and each one before it is placed one song
 *     length earlier.
 *   * Looks far apart, or more songs than fit in the gap: spread evenly across the gap.
 *
 * Every time returned is after `previousLookAt`, not after `now`, and they are distinct and
 * in order.
 */
export function estimatePlayTimes(durationsMs: (number | undefined)[], previousLookAt: Date, now: Date): Date[] {
  const count = durationsMs.length;
  if (count === 0) return [];
  const end = now.getTime();
  const gap = Math.max(count + 1, end - previousLookAt.getTime());
  const start = end - gap;

  if (gap <= NEAR_REAL_TIME_MS) {
    const times: number[] = [end];
    for (let i = 1; i < count; i++) times.push(times[i - 1] - (durationsMs[i - 1] ?? TYPICAL_SONG_MS));
    if (times[count - 1] > start) return times.map((t) => new Date(t));
    // More songs than the gap has room for (skipping through an album): share it out.
    return durationsMs.map((_, i) => new Date(end - Math.floor((gap * i) / count)));
  }
  return durationsMs.map((_, i) => new Date(start + Math.floor((gap * (count - i)) / (count + 1))));
}
