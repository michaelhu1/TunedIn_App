import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, jsonError } from "@/lib/api";
import { findSpotifyTrackId } from "@/lib/sources/spotify";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/open/spotify?trackId=...  ->  redirects to the song on Spotify.
// "Open in Spotify" links point here. The first time anyone opens a song we look up its
// Spotify id and remember it, so later opens are instant. On a phone with Spotify
// installed, the open.spotify.com link opens the app.
export async function GET(request: NextRequest) {
  if (!(await getSessionUser())) return jsonError(401, "Sign in first.");

  const trackId = request.nextUrl.searchParams.get("trackId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(trackId)) return jsonError(400, "Unknown track.");

  const admin = createAdminClient();
  const { data: track } = await admin
    .from("tracks")
    .select("title, artist, isrc, spotify_id")
    .eq("id", trackId)
    .maybeSingle();
  if (!track) return jsonError(404, "Unknown track.");

  let spotifyId: string | null = track.spotify_id;
  if (!spotifyId) {
    spotifyId = await findSpotifyTrackId(track);
    if (spotifyId) await admin.from("tracks").update({ spotify_id: spotifyId }).eq("id", trackId);
  }

  const url = spotifyId
    ? `https://open.spotify.com/track/${spotifyId}`
    : `https://open.spotify.com/search/${encodeURIComponent(`${track.artist} ${track.title}`)}`;
  return NextResponse.redirect(url, 302);
}
