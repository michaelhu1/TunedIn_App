// Words for the taste match card. Pure functions; see taste-match.test.ts.
//
// The score is a cosine similarity of the two people's artist plays (see taste_match() in
// supabase/migrations/*_profile_connection.sql). Two students who both have a few hundred
// artists rarely score very high, so modest numbers are normal. Still, the wording stays
// honest: a low score is described as a low score, never as a great match.

export type MatchBand = { min: number; read: string };

/** Checked from the top down; the first band whose `min` the score reaches wins. */
export const MATCH_BANDS: MatchBand[] = [
  { min: 70, read: "Very similar taste. You could share a queue." },
  { min: 40, read: "A lot in common." },
  { min: 15, read: "Some taste in common." },
  { min: 1, read: "A little overlap, mostly different taste. Plenty to swap." },
];

const NOTHING_SHARED = "Different taste so far. A good chance to swap recommendations.";

/** The one-line read under the percentage. */
export function matchRead(score: number, sharedCount: number): string {
  // No shared artists means a score of 0; check both so a rounding quirk cannot
  // describe "nothing in common" as overlap.
  if (sharedCount <= 0 || score <= 0) return NOTHING_SHARED;
  return MATCH_BANDS.find((b) => score >= b.min)?.read ?? NOTHING_SHARED;
}

/** ["A"] -> "A"; ["A", "B"] -> "A and B"; ["A", "B", "C"] -> "A, B and C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * "You both play SZA, Frank Ocean and Tyler, The Creator", plus "and N more" when more
 * artists are shared than are named. Null when nothing is shared.
 */
export function sharedArtistsSentence(names: string[], sharedCount: number): string | null {
  const shown = names.filter((n) => n.trim() !== "");
  const more = Math.max(0, sharedCount - shown.length);
  if (shown.length === 0) {
    // Should not happen (the database names up to 3), but say something true if it does.
    return more > 0 ? `You both play ${more} of the same ${more === 1 ? "artist" : "artists"}.` : null;
  }
  const list = more > 0 ? joinNames([...shown, `${more} more`]) : joinNames(shown);
  return `You both play ${list}.`;
}
