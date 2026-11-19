import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/api";
import { lastfmAuthUrl, lastfmWebAuthEnabled } from "@/lib/sources/lastfm-auth";

// GET /api/lastfm/connect
// Starts "Connect Last.fm": sends the signed-in person to Last.fm to sign in and approve.
// A random value is kept in a cookie and put in the return address, so that when Last.fm
// sends someone back we know the trip started here, in this browser (see the callback).
export async function GET(request: NextRequest) {
  if (!(await getSessionUser())) return NextResponse.redirect(new URL("/login", request.url));
  if (!lastfmWebAuthEnabled()) return NextResponse.redirect(new URL("/connect?lastfm=unavailable", request.url));

  const state = randomBytes(16).toString("hex");
  const callback = new URL(`/api/lastfm/callback/${state}`, request.nextUrl.origin).toString();
  const response = NextResponse.redirect(lastfmAuthUrl(process.env.LASTFM_API_KEY!, callback));
  response.cookies.set("lastfm_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    maxAge: 15 * 60,
    path: "/api/lastfm/callback",
  });
  return response;
}
