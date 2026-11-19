import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, jsonError } from "@/lib/api";
import { searchArtists } from "@/lib/sources/artists";

// GET /api/artists?q=sza  ->  artists matching the text, for the favourite-artists picker.
export async function GET(request: NextRequest) {
  if (!(await getSessionUser())) return jsonError(401, "Sign in first.");
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ results: [] });
  return NextResponse.json({ results: await searchArtists(q, 8) });
}
