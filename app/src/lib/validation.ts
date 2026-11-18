// Mirrors the database rules so people get a friendly message before a round trip.
// The database is still the real gate (see supabase/migrations).

export const UNIVERSITY_EMAIL_DOMAIN = "nyu.edu";

export function isUniversityEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return domain === UNIVERSITY_EMAIL_DOMAIN || domain.endsWith("." + UNIVERSITY_EMAIL_DOMAIN);
}

export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;
