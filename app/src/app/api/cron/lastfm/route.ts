import { NextResponse, type NextRequest } from "next/server";
import { syncLastfmUser } from "@/lib/lastfm-sync";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/cron/lastfm   (Authorization: Bearer <CRON_SECRET>)
// The scheduled reader. A timer (see docs/AUTOPILOT.md) calls this every couple of minutes;
// each call refreshes the connected people whose data is oldest, a few at a time, and stops
// before the hosting time limit. Running it more often just means fresher data.
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

  let users = 0;
  let imported = 0;
  for (const u of due ?? []) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const result = await syncLastfmUser(admin, { userId: u.user_id, username: u.lastfm_username, cursor: u.lastfm_cursor });
    users++;
    imported += result.imported;
    await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_USERS_MS));
  }
  return NextResponse.json({ ok: true, users, imported, ms: Date.now() - started });
}
