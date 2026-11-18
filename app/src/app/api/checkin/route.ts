import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, jsonError, sourceErrorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTrack } from "@/lib/tracks";

// Only a spam guard. Changing your mind a moment later must work, and chart fairness
// comes from how plays are counted (one listener counts once per song per day), not from this.
const MIN_SECONDS_BETWEEN_CHECKINS = 5;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/checkin  { trackId }           a song we already know (recents, trending)
// POST /api/checkin  { artist, title }     a song picked from search
//
// Records one play and makes the song your status for the rest of the listening day.
// The client only names the song. Art, ids and the canonical spelling come from the
// metadata source on the server, so nothing a user types ends up in the shared track list.
export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in first.");

  const body = await request.json().catch(() => null);
  const admin = createAdminClient();

  const { data: last } = await admin
    .from("plays")
    .select("played_at")
    .eq("user_id", session.userId)
    .eq("source", "checkin")
    .order("played_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last && Date.now() - new Date(last.played_at).getTime() < MIN_SECONDS_BETWEEN_CHECKINS * 1000) {
    return jsonError(429, "You just checked in. Try again in a few seconds.");
  }

  let trackId: string | null = null;
  if (typeof body?.trackId === "string" && UUID.test(body.trackId)) {
    const { data } = await admin.from("tracks").select("id").eq("id", body.trackId).maybeSingle();
    trackId = data?.id ?? null;
  } else {
    const artist = typeof body?.artist === "string" ? body.artist.trim().slice(0, 200) : "";
    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 200) : "";
    if (!artist || !title) return jsonError(400, "Pick a song to check in.");
    try {
      trackId = await resolveTrack(admin, { artist, title }, { requireMatch: true });
    } catch (err) {
      return sourceErrorResponse(err);
    }
  }
  if (!trackId) return jsonError(422, "We could not find that song.");

  const { error } = await admin.rpc("record_checkin", { p_user_id: session.userId, p_track_id: trackId });
  if (error) {
    // 23503 = the user has no profile row yet (has not finished onboarding).
    if (error.code === "23503") return jsonError(403, "Finish setting up your profile first.");
    console.error(error);
    return jsonError(500, "Could not save your check-in.");
  }

  // The reward: how many people at NYU have this song today, you included.
  const [{ data: track }, { data: listeners }] = await Promise.all([
    admin.from("tracks").select("title, artist").eq("id", trackId).single(),
    admin.rpc("track_listeners_today", { p_track_id: trackId }),
  ]);

  return NextResponse.json({
    ok: true,
    trackId,
    title: track?.title ?? null,
    artist: track?.artist ?? null,
    listenersToday: typeof listeners === "number" ? listeners : 1,
  });
}
