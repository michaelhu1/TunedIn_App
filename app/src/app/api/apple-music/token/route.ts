import { NextResponse } from "next/server";
import { getSessionUser, jsonError } from "@/lib/api";
import { appleMusicCredentials, createDeveloperToken } from "@/lib/sources/apple-music-token";

// GET /api/apple-music/token  ->  { developerToken }
// The "Connect Apple Music" button needs a developer token to open Apple's sign-in window.
// It identifies the app, not a person, and is valid for an hour. Only signed-in people can
// fetch one, so it is not sitting in the page for anyone to copy.
const BROWSER_TOKEN_SECONDS = 60 * 60;

export async function GET() {
  if (!(await getSessionUser())) return jsonError(401, "Sign in first.");
  const creds = appleMusicCredentials();
  if (!creds) return jsonError(404, "Apple Music is not set up on this server.");
  try {
    return NextResponse.json(
      { developerToken: createDeveloperToken(creds, BROWSER_TOKEN_SECONDS) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    // Almost always a mangled APPLE_MUSIC_PRIVATE_KEY. Log the reason, never the key.
    console.error("Apple Music developer token could not be signed:", err instanceof Error ? err.message : err);
    return jsonError(500, "Apple Music is not set up correctly on this server.");
  }
}
