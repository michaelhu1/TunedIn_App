import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, jsonError } from "@/lib/api";
import { canonicalArtistName } from "@/lib/sources/artists";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_ARTISTS = 5;

// PUT /api/profile/artists  { names: ["SZA", "Frank Ocean"] }
// Sets the signed-in person's favourite artists (up to five; an empty list clears them).
// Every name is looked up in the music catalogue and stored in the catalogue's spelling.
// Names that are not real artists are dropped, so nothing free-form reaches a profile.
export async function PUT(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in first.");

  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.names)) return jsonError(400, "Send a list of artist names.");
  const wanted = (body.names as unknown[])
    .filter((n): n is string => typeof n === "string")
    .map((n) => n.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, MAX_ARTISTS);

  const checked = await Promise.all(wanted.map((n) => canonicalArtistName(n)));
  // Remove the ones that were not found, and any repeats.
  const names = [...new Set(checked.filter((n): n is string => n !== null))];

  const { data, error } = await createAdminClient()
    .from("profiles")
    .update({ favorite_artists: names })
    .eq("id", session.userId)
    .select("id");
  if (error) {
    console.error(error);
    return jsonError(500, "Could not save your artists. Try again.");
  }
  if (!data?.length) return jsonError(403, "Finish setting up your profile first.");

  return NextResponse.json({ ok: true, names });
}
