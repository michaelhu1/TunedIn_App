// Checks for what people type into the profile editor. Pure functions, so they can run in
// the browser (friendly message before a round trip) and in tests.
//
// The database is still the real gate (see supabase/migrations/*_profiles.sql). These
// mirror its rules; if the two ever disagree, the database wins and the editor shows the
// error it sends back.
//
// Limits and the list of allowed link hosts are passed in rather than imported from
// src/lib/profile.ts, because that file is server-only and cannot be bundled for the browser.

/**
 * Length the way Postgres counts it (`char_length`): one per character, so an emoji is 1.
 * JavaScript's `.length` counts UTF-16 units, which makes many emoji 2 and would reject
 * text the database would accept.
 */
export function charLength(s: string): number {
  return [...s].length;
}

/** Trim, and turn an empty result into null (the database stores "nothing" as null). */
export function cleanText(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Optional text with a maximum length. Returns the cleaned value to store. */
export function validateOptionalText(raw: string, max: number, label: string): Result<string | null> {
  const value = cleanText(raw);
  if (value !== null && charLength(value) > max) {
    return { ok: false, error: `${label} can be at most ${max} characters.` };
  }
  return { ok: true, value };
}

export const CLASS_YEAR_MIN = 2015;
export const CLASS_YEAR_MAX = 2040;

/** The years offered in the class-year picker: last year through six years from now. */
export function classYearOptions(now: Date, current: number | null): number[] {
  const thisYear = now.getFullYear();
  const years: number[] = [];
  for (let y = thisYear - 1; y <= thisYear + 6; y++) {
    if (y >= CLASS_YEAR_MIN && y <= CLASS_YEAR_MAX) years.push(y);
  }
  // Keep someone's saved year selectable even once it falls outside the window, so opening
  // the editor and saving something else never silently clears it.
  if (current !== null && !years.includes(current)) years.push(current);
  return years.sort((a, b) => a - b);
}

/** "" means no class year. Anything else must be a whole year the database accepts. */
export function parseClassYear(raw: string): Result<number | null> {
  if (raw === "") return { ok: true, value: null };
  const year = Number(raw);
  if (!Number.isInteger(year) || year < CLASS_YEAR_MIN || year > CLASS_YEAR_MAX) {
    return { ok: false, error: "Pick a class year from the list." };
  }
  return { ok: true, value: year };
}

// Friendly names for the hosts in LINK_HOSTS, for error messages.
const SERVICE_NAMES: Record<string, string> = {
  "open.spotify.com": "Spotify",
  "music.apple.com": "Apple Music",
  "music.youtube.com": "YouTube Music",
  "youtube.com": "YouTube",
  "www.youtube.com": "YouTube",
  "m.youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "soundcloud.com": "SoundCloud",
  "on.soundcloud.com": "SoundCloud",
  "deezer.com": "Deezer",
  "www.deezer.com": "Deezer",
  "tidal.com": "TIDAL",
};

/** "Spotify, Apple Music, ... or TIDAL", from a list of hosts, without repeats. */
export function serviceList(hosts: readonly string[]): string {
  const names = [...new Set(hosts.map((h) => SERVICE_NAMES[h] ?? h))];
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

export const LINK_URL_MAX = 300;
export const LINK_TITLE_MAX = 40;

/**
 * A playlist link: a title of 1-40 characters and an https address on a known music
 * service. Returns the cleaned title and the address in the exact form to store.
 */
export function validateLink(
  rawTitle: string,
  rawUrl: string,
  hosts: readonly string[],
): Result<{ title: string; url: string }> {
  const title = rawTitle.trim();
  if (title === "") return { ok: false, error: "Give the playlist a name." };
  if (charLength(title) > LINK_TITLE_MAX) {
    return { ok: false, error: `Playlist names can be at most ${LINK_TITLE_MAX} characters.` };
  }

  let text = rawUrl.trim();
  if (text === "") return { ok: false, error: "Paste the playlist's link." };
  // People often paste "open.spotify.com/playlist/..." without the scheme. Adding https://
  // is safe because the host check below still has to pass.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;

  const accepted = `Links must go to ${serviceList(hosts)}.`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: `That does not look like a link. ${accepted}` };
  }
  if (url.protocol !== "https:") return { ok: false, error: "Links must start with https://." };
  // A username, password or unusual port in a link is a classic way to disguise where it
  // really goes, and no music service needs one.
  if (url.username || url.password || url.port) {
    return { ok: false, error: `That link has extra parts we do not allow. ${accepted}` };
  }
  if (!hosts.includes(url.hostname)) return { ok: false, error: accepted };

  // Store the parsed form: it lowercases the host and always has a "/" after it, which is
  // exactly the shape the database check (^https://host/) expects.
  const href = url.href;
  if (href.length > LINK_URL_MAX) {
    return { ok: false, error: `That link is too long (at most ${LINK_URL_MAX} characters).` };
  }
  return { ok: true, value: { title, url: href } };
}

/** The lowest position from 1 to max that is not taken, or null if all are. */
export function firstFreePosition(taken: readonly number[], max: number): number | null {
  for (let p = 1; p <= max; p++) {
    if (!taken.includes(p)) return p;
  }
  return null;
}
