// The app's day runs from 4am to 4am in New York, so a late night counts as the same day.
// This mirrors public.listening_day() in the database.

const NY = "America/New_York";

/** The listening day a moment belongs to, as YYYY-MM-DD. */
export function listeningDay(at: Date | string | number = Date.now()): string {
  return new Date(new Date(at).getTime() - 4 * 3600_000).toLocaleDateString("en-CA", { timeZone: NY });
}

/** The first listening day of a window of `days` days that ends today. "This week" is today
 *  and the six days before it: seven days, never eight. */
export function windowStartDay(days: number, now: Date | number = Date.now()): string {
  const [y, m, d] = listeningDay(now).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - (days - 1))).toISOString().slice(0, 10);
}
