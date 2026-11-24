import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, jsonError, sourceErrorResponse } from "@/lib/api";
import { AppleMusicAuthError, getRecentlyPlayed } from "@/lib/sources/apple-music";
import { getServerDeveloperToken } from "@/lib/sources/apple-music-token";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/apple-music  { musicUserToken }        connect Apple Music.
// POST /api/apple-music  { musicUserToken: null }  disconnect.
//
// The Music User Token is what Apple gives an app after the person approves it in Apple's
// own sign-in window. The website gets it from MusicKit JS; the iOS app will get it from
// MusicKit and call this same endpoint. We keep it on the server (never readable by any
// browser) and use it only to read which songs the person played.
export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in first.");

  const body = await request.json().catch(() => null);
  const admin = createAdminClient();

  if (body?.musicUserToken == null) {
    await admin.from("apple_music_links").delete().eq("user_id", session.userId);
    const { error } = await admin
      .from("user_settings")
      .update({ apple_music_connected_at: null, apple_music_synced_at: null, apple_music_status: null })
      .eq("user_id", session.userId);
    if (error) return jsonError(500, "Could not disconnect. Try again.");
    return NextResponse.json({ ok: true, connected: false });
  }

  let developerToken: string | null;
  try {
    developerToken = getServerDeveloperToken();
  } catch (err) {
    console.error("Apple Music developer token could not be signed:", err instanceof Error ? err.message : err);
    return jsonError(500, "Apple Music is not set up correctly on this server.");
  }
  if (!developerToken) return jsonError(404, "Apple Music is not set up on this server.");

  const musicUserToken = typeof body.musicUserToken === "string" ? body.musicUserToken.trim() : "";
  if (!/^[A-Za-z0-9+/=._-]{20,4096}$/.test(musicUserToken)) return jsonError(400, "That is not an Apple Music token.");

  const { data: settings } = await admin.from("user_settings").select("user_id").eq("user_id", session.userId).maybeSingle();
  if (!settings) return jsonError(403, "Finish setting up your profile first.");

  // Prove the token works before saving it, by doing the one thing we will use it for.
  // The list we get back becomes the starting point: plays are counted from here on.
  let recentIds: string[];
  try {
    recentIds = (await getRecentlyPlayed({ developerToken, musicUserToken })).map((t) => t.id);
  } catch (err) {
    if (err instanceof AppleMusicAuthError) {
      return jsonError(403, "Apple Music would not let us read your plays. It needs an active Apple Music subscription.");
    }
    return sourceErrorResponse(err);
  }

  const { error: linkError } = await admin
    .from("apple_music_links")
    .upsert({ user_id: session.userId, music_user_token: musicUserToken, recent_ids: recentIds }, { onConflict: "user_id" });
  if (linkError) return jsonError(500, "Could not save. Try again.");

  // One automatic source at a time (see the migration): Apple Music replaces Last.fm.
  const now = new Date().toISOString();
  const { error } = await admin
    .from("user_settings")
    .update({ lastfm_username: null, apple_music_connected_at: now, apple_music_synced_at: now, apple_music_status: "ok" })
    .eq("user_id", session.userId);
  if (error) {
    await admin.from("apple_music_links").delete().eq("user_id", session.userId);
    return jsonError(500, "Could not save. Try again.");
  }

  return NextResponse.json({ ok: true, connected: true });
}
