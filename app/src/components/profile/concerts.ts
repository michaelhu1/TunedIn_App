// Sorting, grouping and date labels for the concerts on a profile. Pure functions (no
// database, no React) so they are easy to test; see concerts.test.ts.
//
// Dates arrive as "YYYY-MM-DD" strings with no time or timezone. We never turn them into a
// local Date: `new Date("2026-12-05")` means midnight UTC, which is still Dec 4 in New York,
// so local getters would show the wrong day. Instead we split the string into numbers and,
// where we need the weekday, ask a UTC date for it (UTC in, UTC out: nothing shifts).

import type { ProfileConcert } from "@/lib/profile";

/** The campus timezone. "Today" for a concert is today in New York, not on the server. */
export const CAMPUS_TIME_ZONE = "America/New_York";

type Ymd = { year: number; month: number; day: number };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-12-05" -> {2026, 12, 5}. Null for anything that is not a real calendar date. */
export function parseYmd(value: string | null): Ymd | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Round-trip through a UTC date to reject things like 2026-02-30.
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** Today's date as "YYYY-MM-DD" in the given timezone. */
export function todayYmd(now: Date = new Date(), timeZone: string = CAMPUS_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * A friendly date: "Sat, Dec 5" this year, "Dec 2024" for a past year. An upcoming concert
 * in a later year keeps its day ("Sat, Jan 9, 2027"), because for plans the day matters.
 * Null when there is no usable date.
 */
export function formatConcertDate(value: string | null, today: string): string | null {
  const d = parseYmd(value);
  const t = parseYmd(today);
  if (!d || !t) return null;
  const month = MONTHS[d.month - 1];
  const weekday = WEEKDAYS[new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()];
  if (d.year === t.year) return `${weekday}, ${month} ${d.day}`;
  if (d.year > t.year) return `${weekday}, ${month} ${d.day}, ${d.year}`;
  return `${month} ${d.year}`;
}

export type ConcertGroups = { going: ProfileConcert[]; went: ProfileConcert[] };

/**
 * Split concerts into "Going to" and "Went to".
 * - A "going" concert dated before today has happened, so it moves to "Went to".
 *   One dated today is still "going" (the show is tonight).
 * - Going: soonest first, undated last. Went: most recent first, undated last.
 * - Ties (same date, or both undated) keep the order the person chose.
 * "YYYY-MM-DD" strings sort correctly as plain text, so we compare them directly.
 */
export function groupConcerts(concerts: ProfileConcert[], today: string): ConcertGroups {
  // Treat an unparseable date like no date, so a bad row cannot break the ordering.
  const dateOf = (c: ProfileConcert) => (parseYmd(c.eventDate) ? c.eventDate : null);
  const going: ProfileConcert[] = [];
  const went: ProfileConcert[] = [];
  for (const c of concerts) {
    const date = dateOf(c);
    if (c.status === "going" && !(date && date < today)) going.push(c);
    else if (c.status === "going" || c.status === "went") went.push(c);
    // Any other status is unknown to this version of the app: skip it.
  }

  const byDate = (direction: 1 | -1) => (a: ProfileConcert, b: ProfileConcert) => {
    const da = dateOf(a);
    const db = dateOf(b);
    if (da && db && da !== db) return da < db ? -direction : direction;
    if (da && !db) return -1; // undated goes last in both groups
    if (!da && db) return 1;
    return a.position - b.position;
  };
  going.sort(byDate(1));
  went.sort(byDate(-1));
  return { going, went };
}
