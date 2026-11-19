import { NextResponse } from "next/server";
import { getSessionUser, jsonError } from "@/lib/api";
import { isStale, syncLastfmUser } from "@/lib/lastfm-sync";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_FRIENDS_PER_CALL = 5;

// POST /api/lastfm/sync
// Called quietly when someone opens the app. It refreshes THEIR plays from Last.fm, and
// then a few friends whose data has gone stale, so the map and friends list are fresh for
// the person looking at them even between scheduled runs.
export async function POST() {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in first.");
  const admin = createAdminClient();

  // Clear out songs and locations from past days (see the same step in the scheduled reader).
  await admin.from("presence").delete().lt("expires_at", new Date().toISOString());

  // Also marks the person as recently active, which the scheduled reader uses to decide
  // whose plays are worth checking often.
  await admin.from("user_settings").update({ last_active_at: new Date().toISOString() }).eq("user_id", session.userId);

  const { data: mine } = await admin
    .from("user_settings")
    .select("lastfm_username, lastfm_cursor, lastfm_synced_at")
    .eq("user_id", session.userId)
    .maybeSingle();

  let me = null;
  if (mine?.lastfm_username && isStale(mine.lastfm_synced_at)) {
    me = await syncLastfmUser(admin, { userId: session.userId, username: mine.lastfm_username, cursor: mine.lastfm_cursor });
  }

  // Friends, read as the signed-in user so row-level security decides who counts as a friend.
  const { data: friends } = await session.supabase.from("my_friendships").select("friend_id").eq("status", "accepted");
  const friendIds = (friends ?? []).map((f) => f.friend_id as string);
  let friendsSynced = 0;
  if (friendIds.length > 0) {
    const { data: stale } = await admin
      .from("user_settings")
      .select("user_id, lastfm_username, lastfm_cursor, lastfm_synced_at")
      .in("user_id", friendIds)
      .not("lastfm_username", "is", null)
      .eq("ghost_mode", false)
      .order("lastfm_synced_at", { ascending: true, nullsFirst: true })
      .limit(MAX_FRIENDS_PER_CALL);
    for (const f of stale ?? []) {
      if (!isStale(f.lastfm_synced_at)) continue;
      await syncLastfmUser(admin, { userId: f.user_id, username: f.lastfm_username, cursor: f.lastfm_cursor });
      friendsSynced++;
    }
  }

  return NextResponse.json({
    ok: true,
    me: me ? { status: me.status, imported: me.imported, nowPlaying: me.nowPlaying } : null,
    friendsSynced,
    changed: (me?.imported ?? 0) > 0 || (me?.nowPlaying ?? false) || friendsSynced > 0,
  });
}
