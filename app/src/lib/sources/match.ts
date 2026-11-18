// Deciding whether a search result is "the same song" as an artist + title from Last.fm.
// Both the Deezer and iTunes adapters search with free text and then run their
// results through `pickBestMatch`, so the matching rules live in one place.
//
// The rule of thumb: return null rather than a wrong song. A missing cover is a small
// annoyance; the wrong song on someone's profile is a bug people notice.

import type { TrackRef } from "./types";

/**
 * Lowercase, strip accents, treat "&" as "and", drop apostrophes and other punctuation.
 * "Beyoncé" -> "beyonce", "TEXAS HOLD 'EM" -> "texas hold em".
 */
export function normalize(s: string): string {
  const out = s
    // Split "é" into "e" + accent mark, then drop only the Latin accent marks.
    // (We do not strip every combining mark: that would mangle Japanese kana.)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’‘`]/g, "") // "hold 'em" -> "hold em", "don't" -> "dont"
    .replace(/[^\p{L}\p{N}]+/gu, " ") // any other punctuation becomes a space
    .trim()
    .replace(/\s+/g, " ");
  // A name made only of symbols ("!!!") would normalise to "", which matches everything.
  return out || s.trim().toLowerCase();
}

// ---------- titles ----------

/** Kinds of "different recording" we must not swap in for the original. */
const VARIANT_WORDS: [RegExp, string][] = [
  [/\blive\b/, "live"],
  [/\b(re)?mix(es)?\b|\brmx\b|\brework\b|\bbootleg\b|\bvip\b/, "remix"],
  [/\bacoustic\b|\bunplugged\b/, "acoustic"],
  [/\bkaraoke\b|\bmade famous\b|\bin the style of\b|\boriginally performed\b/, "karaoke"],
  [/\binstrumental\b/, "instrumental"],
  [/\bcover\b|\btribute\b/, "cover"],
  [/\bsped up\b|\bspeed up\b|\bnightcore\b/, "sped up"],
  [/\bslowed\b|\breverb\b/, "slowed"],
  [/\ba ?cappella\b|\bacapella\b/, "acapella"],
  [/\bdemo\b/, "demo"],
  [/\bextended\b/, "extended"],
];

/** Labels that describe the same recording: safe to ignore. */
const BENIGN =
  /\bremaster(ed)?\b|\bdeluxe\b|\bbonus\b|\bexplicit\b|\bclean\b|\bmono\b|\bstereo\b|^(single|album|radio|original|lp|ep) (version|edit|mix)$|^radio edit$|^original$|^from\b|\banniversary\b|\bedition\b/;

/** "feat. X", "ft. X", "with X": the featured artist, not part of the title. */
const FEATURE = /^(feat|ft|featuring|with)\b/;

export type ParsedTitle = {
  /** The title with every bracket and " - suffix" removed, normalised. */
  core: string;
  /** Recording kinds found in the suffixes, e.g. {"live"}. */
  variants: Set<string>;
  /** Suffixes we could not classify, e.g. "double shot version". Mild penalty. */
  otherTags: string[];
  /** Normalised bracket text that might be an alternate title, e.g. "spring day". */
  alts: string[];
};

export function parseTitle(title: string): ParsedTitle {
  const tags: string[] = [];
  // 1. Pull out (...) and [...] groups: "Song (feat. X) [Remastered]".
  let rest = title.replace(/\(([^()]*)\)|\[([^[\]]*)\]/g, (_, a, b) => {
    tags.push(a ?? b);
    return " ";
  });
  // 2. Dash suffixes: "Here Comes The Sun - Remastered 2009". Needs spaces around the
  //    dash so hyphenated words ("Anti-Hero") are left alone.
  const parts = rest.split(/\s[-–—]\s/);
  rest = parts[0];
  tags.push(...parts.slice(1));
  // 3. A bare "feat." with no brackets: "Song feat. Someone".
  rest = rest.replace(/\s(feat\.?|ft\.|featuring)\s.*$/i, "");

  const variants = new Set<string>();
  const otherTags: string[] = [];
  const alts: string[] = [];
  for (const raw of tags) {
    const tag = normalize(raw);
    if (!tag || FEATURE.test(tag)) continue;
    let isVariant = false;
    for (const [re, kind] of VARIANT_WORDS) {
      // "Original Mix" is the original, not a remix.
      if (kind === "remix" && /^original mix$/.test(tag)) continue;
      if (re.test(tag)) {
        variants.add(kind);
        isVariant = true;
      }
    }
    if (isVariant || BENIGN.test(tag)) continue;
    otherTags.push(tag);
    alts.push(tag);
  }

  // A title that is entirely in brackets, e.g. "(untitled)", keeps its text.
  const core = normalize(rest) || normalize(title);
  return { core, variants, otherTags, alts };
}

// ---------- artists ----------

/** The first-billed artist: "Calvin Harris & Dua Lipa" -> "Calvin Harris". */
function primaryArtist(artist: string): string {
  return artist.split(/,|&|\s(?:feat\.?|ft\.?|featuring|with|x|and|vs\.?)\s/i)[0];
}

function stripThe(s: string): string {
  return s.replace(/^the /, "");
}

/**
 * True if two artist strings name the same act. We accept an exact (normalised) match,
 * or one side equal to the other's first-billed artist, because Last.fm often reports
 * "A & B" while the catalogue lists only "A" as the main artist (or the reverse).
 */
export function artistsMatch(a: string, b: string): boolean {
  const na = stripThe(normalize(a));
  const nb = stripThe(normalize(b));
  if (na === nb) return true;
  const pa = stripThe(normalize(primaryArtist(a)));
  const pb = stripThe(normalize(primaryArtist(b)));
  return na === pb || pa === nb;
}

// ---------- scoring ----------

/** What a catalogue result looks like to the matcher. */
export type Candidate = {
  artist: string;
  title: string;
  album?: string;
  explicit?: boolean;
  /** A censored radio edit (iTunes "cleaned"). */
  clean?: boolean;
};

/**
 * Score a candidate against what we were asked for, or null if it is not the same song.
 * Higher is better. Exported for tests.
 */
export function scoreCandidate(ref: TrackRef, c: Candidate): number | null {
  if (!artistsMatch(ref.artist, c.artist)) return null;

  const q = parseTitle(ref.title);
  const t = parseTitle(c.title);

  // The titles must agree on their core, or one must be the other's bracketed alternate
  // title. That covers K-pop releases listed as "봄날 (Spring Day)" in one place and
  // "Spring Day" in another.
  const sameCore =
    q.core === t.core ||
    t.alts.includes(q.core) ||
    q.alts.includes(t.core) ||
    q.alts.some((a) => t.alts.includes(a));
  if (!sameCore) return null;

  // Live / remix / karaoke: allowed only if the query asked for that kind of recording.
  for (const v of q.variants) if (!t.variants.has(v)) return null;
  for (const v of t.variants) if (!q.variants.has(v)) return null;

  let score = 10;
  if (q.core === t.core) score += 2; // direct title match beats an alternate-title match
  // Unclassified tags ("Double Shot Version", "Taylor's Version") are probably the same
  // song, so they do not disqualify, but the version that agrees on them wins:
  // a plain query prefers the plain title, "(Taylor's Version)" prefers that one.
  // (A tag that is just the other side's title, as in "봄날 (Spring Day)", is ignored.)
  score -= 2 * t.otherTags.filter((x) => !q.otherTags.includes(x) && x !== q.core).length;
  score -= 2 * q.otherTags.filter((x) => !t.otherTags.includes(x) && x !== t.core).length;
  if (normalize(ref.artist) === normalize(c.artist)) score += 1;
  if (ref.album && c.album && parseTitle(ref.album).core === parseTitle(c.album).core) score += 1;
  // Streams are usually of the explicit version; prefer it over the radio edit.
  if (c.explicit) score += 0.5;
  if (c.clean) score -= 0.5;
  return score;
}

/**
 * Pick the best candidate for `ref`, or null if none is the same song.
 * Ties go to the earlier candidate (the catalogue's own relevance order).
 */
export function pickBestMatch<T>(
  ref: TrackRef,
  candidates: T[],
  toCandidate: (c: T) => Candidate,
): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const s = scoreCandidate(ref, toCandidate(c));
    if (s !== null && s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return best;
}

/**
 * The text to send to a catalogue search for a lookup: artist plus the clean
 * title. Dropping "- Remastered 2009" and "(feat. X)" improves recall; live/remix words
 * are kept so those recordings show up when they were asked for.
 */
export function lookupQuery(ref: TrackRef): string {
  const p = parseTitle(ref.title);
  // Bracketed alternate titles go in too: Deezer's search ignores Hangul, so for
  // "봄날 (Spring Day)" it is the "spring day" part that finds the track.
  const title = [p.core, ...p.alts, ...p.variants].join(" ");
  // Keep the full artist ("Tyler, The Creator"), only cutting a trailing "feat. X".
  const artist = ref.artist.replace(/\s(feat\.?|ft\.?|featuring)\s.*$/i, "");
  return `${normalize(artist)} ${title}`;
}
