// Turning stored keys into what the page shows. Pure functions; see labels.test.ts.
//
// The database only accepts keys from the fixed lists, but the lists live in two places
// (profile-options.ts and the migration). If they ever drift, or an old row has a key this
// version of the app no longer knows, we skip it rather than show a raw key or crash.

import { GENRES, INSTAGRAM_PATTERN } from "../../lib/profile-options"; // relative: vitest has no "@/" alias

/** Labels for the keys that exist in `options`, in the stored order. Unknown keys are dropped. */
export function labelsFor(keys: readonly string[], options: Readonly<Record<string, string>>): string[] {
  // Object.hasOwn, not `key in options`: "toString" is "in" every object.
  return keys.flatMap((k) => (Object.hasOwn(options, k) ? [options[k]] : []));
}

/** The label for one key, or null when the key is missing or unknown. */
export function labelFor(key: string | null, options: Readonly<Record<string, string>>): string | null {
  return key !== null && Object.hasOwn(options, key) ? options[key] : null;
}

const GENRE_SET: ReadonlySet<string> = new Set(GENRES);

/** Genre tags are stored as their display text, so this only drops ones not on the list. */
export function knownGenres(genres: readonly string[]): string[] {
  return genres.filter((g) => GENRE_SET.has(g));
}

/**
 * The Instagram profile URL for a handle, or null. The database already checks the handle,
 * but we check again before building a link (defence in depth): a handle that passes this
 * pattern can only contain letters, digits, dots and underscores, so it cannot change
 * which site or page the link opens.
 */
export function instagramUrl(handle: string | null): string | null {
  if (!handle || !INSTAGRAM_PATTERN.test(handle)) return null;
  return `https://www.instagram.com/${handle}/`;
}
