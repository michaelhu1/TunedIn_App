// The app's day runs from 4am to 4am in New York, so a late night counts as the same day.
// This mirrors public.listening_day() in the database.

const NY = "America/New_York";

const NY_PARTS = new Intl.DateTimeFormat("en-CA", { timeZone: NY, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });

/** The listening day a moment belongs to, as YYYY-MM-DD. Read off the New York clock: before
 *  4am it is still the previous day. (Going by the clock, not by subtracting four real
 *  hours, keeps this identical to the database on the two days a year the clocks change.) */
export function listeningDay(at: Date | string | number = Date.now()): string {
  const parts = Object.fromEntries(NY_PARTS.formatToParts(new Date(at)).map((p) => [p.type, p.value]));
  const day = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - (Number(parts.hour) < 4 ? 1 : 0)));
  return day.toISOString().slice(0, 10);
}

/** The first listening day of a window of `days` days that ends today. "This week" is today
 *  and the six days before it: seven days, never eight. */
export function windowStartDay(days: number, now: Date | number = Date.now()): string {
  const [y, m, d] = listeningDay(now).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - (days - 1))).toISOString().slice(0, 10);
}
