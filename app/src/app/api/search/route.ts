import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, jsonError, sourceErrorResponse } from "@/lib/api";
import { getMetadataSource } from "@/lib/sources";

// GET /api/search?q=espresso  ->  songs for the check-in screen.
// Signed-in only, so strangers cannot use us as a free proxy to Deezer.
export async function GET(request: NextRequest) {
  if (!(await getSessionUser())) return jsonError(401, "Sign in first.");

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ results: [] });

  try {
    const results = await getMetadataSource().search(q, 8);
    return NextResponse.json({
      results: results.map((t) => ({
        artist: t.artist,
        title: t.title,
        album: t.album ?? null,
        artworkUrl: t.artworkUrl ?? null,
        deezerId: t.deezerId ?? null,
      })),
    });
  } catch (err) {
    return sourceErrorResponse(err);
  }
}
