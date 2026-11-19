import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, jsonError, sourceErrorResponse } from "@/lib/api";
import { MAX_FAVORITES, type ProfileFavorite } from "@/lib/profile";
import { firstFreePosition } from "@/lib/profile-validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTrack } from "@/lib/tracks";

// POST /api/profile/favorites  { artist, title }   add a song to "On repeat right now"
//
// Adding goes through the server for the same reason check-ins do: the song is resolved
// against the music catalogue here, so nobody can write arbitrary text into the shared
// track list. The database does not let users insert favourites themselves.
//
// The client only names the song. Who it is for comes from the session, and which slot
// it goes in is decided here, so neither can be forged. Removing a favourite does not
// need this route: row-level security lets owners delete their own rows directly.
export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in first.");

  const body = await request.json().catch(() => null);
  const artist = typeof body?.artist === "string" ? body.artist.trim().slice(0, 200) : "";
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 200) : "";
  if (!artist || !title) return jsonError(400, "Pick a song to add.");

  const admin = createAdminClient();

  // Check the cheap thing first: no point asking the music service about a song when
  // there is no room for it.
  const { data: existing, error: readError } = await admin
    .from("profile_favorites")
    .select("position, track_id")
    .eq("user_id", session.userId);
  if (readError) {
    console.error(readError);
    return jsonError(500, "Could not load your favourites.");
  }
  if (existing.length >= MAX_FAVORITES) {
    return jsonError(409, `You can pick up to ${MAX_FAVORITES} songs. Remove one first.`);
  }

  let trackId: string | null;
  try {
    trackId = await resolveTrack(admin, { artist, title }, { requireMatch: true });
  } catch (err) {
    return sourceErrorResponse(err);
  }
  if (!trackId) return jsonError(422, "We could not find that song.");

  // Compared after resolving, because two different spellings can be the same song.
  if (existing.some((f) => f.track_id === trackId)) {
    return jsonError(409, "That song is already on your profile.");
  }

  const position = firstFreePosition(
    existing.map((f) => f.position),
    MAX_FAVORITES,
  )!; // Not null: we checked there is room above.

  const { error } = await admin.from("profile_favorites").insert({ user_id: session.userId, position, track_id: trackId });
  if (error) {
    // 23503 = foreign key: the user has no profile row yet (has not finished onboarding).
    if (error.code === "23503") return jsonError(403, "Finish setting up your profile first.");
    // 23505 = unique: the slot or the song was taken between our read and this insert,
    // for example by a second tab. Rare, and trying again sorts it out.
    if (error.code === "23505") return jsonError(409, "Your favourites just changed. Refresh and try again.");
    console.error(error);
    return jsonError(500, "Could not save that song.");
  }

  const { data: track } = await admin.from("tracks").select("title, artist, artwork_url").eq("id", trackId).single();

  const favorite: ProfileFavorite = {
    position,
    trackId,
    title: track?.title ?? title,
    artist: track?.artist ?? artist,
    artworkUrl: track?.artwork_url ?? null,
  };
  return NextResponse.json(favorite);
}
