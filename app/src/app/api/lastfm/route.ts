import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, jsonError, sourceErrorResponse } from "@/lib/api";
import { getListeningSource } from "@/lib/sources";

// POST /api/lastfm  { username }   connect a Last.fm account (username only, no password:
//                                   we read the public profile).
// POST /api/lastfm  { username: null }   disconnect.
export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in first.");

  const body = await request.json().catch(() => null);
  let username: string | null = null;

  if (body?.username != null) {
    const raw = typeof body.username === "string" ? body.username.trim() : "";
    // Last.fm usernames: 2-15 characters, letters, numbers, - and _.
    if (!/^[A-Za-z0-9_-]{2,15}$/.test(raw)) return jsonError(400, "That does not look like a Last.fm username.");
    try {
      if (!(await getListeningSource().userExists(raw))) {
        return jsonError(404, "No Last.fm user with that name.");
      }
    } catch (err) {
      return sourceErrorResponse(err);
    }
    username = raw;
  }

  // Written as the user, so row-level security guarantees they can only change their own row.
  const { data, error } = await session.supabase
    .from("user_settings")
    .update({ lastfm_username: username })
    .eq("user_id", session.userId)
    .select("user_id");
  if (error || !data?.length) return jsonError(403, "Finish setting up your profile first.");

  return NextResponse.json({ ok: true, username });
}
