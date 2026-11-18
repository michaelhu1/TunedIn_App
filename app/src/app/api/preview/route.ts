import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, jsonError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

// GET /api/preview?trackId=<our id>   or   ?deezerId=<Deezer id>
//   ->  { url } for a 30-second clip, or { url: null } when the song has none.
// Deezer's preview links expire after about 15 minutes, so we ask for a fresh one at the
// moment someone presses play instead of storing them.
export async function GET(request: NextRequest) {
  if (!(await getSessionUser())) return jsonError(401, "Sign in first.");

  const params = request.nextUrl.searchParams;
  const trackId = params.get("trackId");
  let deezerId: number | null = null;

  if (trackId) {
    if (!/^[0-9a-f-]{36}$/i.test(trackId)) return jsonError(400, "Unknown track.");
    const supabase = await createClient();
    const { data: track } = await supabase.from("tracks").select("deezer_id").eq("id", trackId).maybeSingle();
    deezerId = track?.deezer_id ?? null;
  } else {
    const raw = params.get("deezerId") ?? "";
    if (!/^[0-9]{1,15}$/.test(raw)) return jsonError(400, "Unknown track.");
    deezerId = Number(raw);
  }
  if (!deezerId) return NextResponse.json({ url: null });

  try {
    const res = await fetch(`https://api.deezer.com/track/${deezerId}`, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    const body = (await res.json()) as { preview?: string };
    return NextResponse.json({ url: body.preview || null });
  } catch {
    return NextResponse.json({ url: null });
  }
}
