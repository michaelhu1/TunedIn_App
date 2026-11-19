import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/api";
import { lastfmUsernameForToken } from "@/lib/sources/lastfm-auth";

// GET /api/lastfm/callback/<state>?token=...
// Where Last.fm sends the person back. We check the trip started in this browser, swap the
// one-time token for their Last.fm username, and save only that username.
export async function GET(request: NextRequest, { params }: { params: Promise<{ state: string }> }) {
  const back = (result: string) => {
    const response = NextResponse.redirect(new URL(`/connect?lastfm=${result}`, request.url));
    response.cookies.set("lastfm_state", "", { maxAge: 0, path: "/api/lastfm/callback" });
    return response;
  };

  const session = await getSessionUser();
  if (!session) return NextResponse.redirect(new URL("/login", request.url));

  // Without this check, someone could send you a link that quietly attaches THEIR Last.fm
  // account to your TunedIn profile.
  const { state } = await params;
  const expected = request.cookies.get("lastfm_state")?.value;
  if (!expected || expected !== state) return back("failed");

  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return back("failed");

  const username = await lastfmUsernameForToken(token);
  if (!username) return back("failed");

  // Saved as the signed-in person, so row-level security limits it to their own settings row.
  const { data, error } = await session.supabase
    .from("user_settings")
    .update({ lastfm_username: username })
    .eq("user_id", session.userId)
    .select("user_id");
  if (error || !data?.length) return back("failed");

  return back("connected");
}
