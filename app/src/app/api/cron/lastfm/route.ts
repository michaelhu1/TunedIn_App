import { NextResponse, type NextRequest } from "next/server";
import { syncAppleMusicUser } from "@/lib/apple-music-sync";
import { syncLastfmUser } from "@/lib/lastfm-sync";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/cron/lastfm   (Authorization: Bearer <CRON_SECRET>)
// The scheduled reader. A timer (see docs/AUTOPILOT.md) calls this every couple of minutes;
// each call refreshes the connected people whose data is oldest, a few at a time, and stops
// before the hosting time limit. Running it more often just means fresher data.
//
// It reads both sources, Last.fm and Apple Music. The address says "lastfm" because that was
// the only source when the schedule was created; it is kept so the schedule keeps working.
//
// Not for browsers: it requires a secret that only the scheduler knows.

export const maxDuration = 60;

const USERS_PER_RUN = 12;
const TIME_BUDGET_MS = 45_000;
const ACTIVE_WITHIN_DAYS = 14; // people who have not opened the app in two weeks are skipped
const PAUSE_BETWEEN_USERS_MS = 300; // stay well under Last.fm's "a few requests a second"

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }

  const started = Date.now();
  const admin = createAdminClient();

  // Housekeeping: yesterday's songs and locations are already ignored everywhere, but the
  // privacy policy says they are cleared, so remove the rows for real.
  await admin.from("presence").delete().lt("expires_at", new Date().toISOString());
  const { data: due, error } = await admin
    .from("user_settings")
    .select("user_id, lastfm_username, lastfm_cursor")
    .not("lastfm_username", "is", null)
    .gte("last_active_at", new Date(Date.now() - ACTIVE_WITHIN_DAYS * 86_400_000).toISOString())
    .order("lastfm_synced_at", { ascending: true, nullsFirst: true })
    .limit(USERS_PER_RUN);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Apple Music. People whose token Apple has stopped accepting are skipped until they
  // reconnect: asking again would only fail again.
  const { data: dueApple } = await admin
    .from("user_settings")
    .select("user_id, apple_music_synced_at")
    .not("apple_music_connected_at", "is", null)
    .neq("apple_music_status", "expired")
    .gte("last_active_at", new Date(Date.now() - ACTIVE_WITHIN_DAYS * 86_400_000).toISOString())
    .order("apple_music_synced_at", { ascending: true, nullsFirst: true })
    .limit(USERS_PER_RUN);

  // Take turns between the two sources, so a slow run on one never starves the other.
  const lastfmJobs = (due ?? []).map((u) => () =>
    syncLastfmUser(admin, { userId: u.user_id, username: u.lastfm_username, cursor: u.lastfm_cursor }));
  const appleJobs = (dueApple ?? []).map((u) => () =>
    syncAppleMusicUser(admin, { userId: u.user_id, syncedAt: u.apple_music_synced_at }));
  const jobs: (() => Promise<{ imported: number }>)[] = [];
  for (let i = 0; i < Math.max(lastfmJobs.length, appleJobs.length); i++) {
    if (lastfmJobs[i]) jobs.push(lastfmJobs[i]);
    if (appleJobs[i]) jobs.push(appleJobs[i]);
  }

  let users = 0;
  let imported = 0;
  for (const job of jobs) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const result = await job();
    users++;
    imported += result.imported;
    await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_USERS_MS));
  }
  return NextResponse.json({ ok: true, users, imported, ms: Date.now() - started });
}
