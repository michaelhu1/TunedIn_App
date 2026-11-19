import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

// Mirrors the database rule: a playlist picture must live on a music service's own image host.
const IMAGE_HOSTS = /^https:\/\/(i\.scdn\.co|mosaic\.scdn\.co|image-cdn-[a-z0-9-]+\.spotifycdn\.com|i\.ytimg\.com|i1\.sndcdn\.com|is[0-9]-ssl\.mzstatic\.com|[a-z0-9-]+\.dzcdn\.net)\//;

/** Each service's "describe this link" address (oEmbed). No login or key needed. */
function oembedUrl(link: URL): string | null {
  const encoded = encodeURIComponent(link.toString());
  switch (link.hostname) {
    case "open.spotify.com":
      return `https://open.spotify.com/oembed?url=${encoded}`;
    case "youtube.com":
    case "www.youtube.com":
    case "m.youtube.com":
    case "music.youtube.com":
    case "youtu.be":
      return `https://www.youtube.com/oembed?format=json&url=${encoded}`;
    case "soundcloud.com":
    case "on.soundcloud.com":
      return `https://soundcloud.com/oembed?format=json&url=${encoded}`;
    default:
      return null; // Apple Music, Deezer and TIDAL offer nothing comparable; they get a plain tile.
  }
}

// POST /api/profile/links/image  { position }
// Looks up the picture for one of the signed-in person's playlist links and saves it.
// The link itself was already saved by the browser under the usual rules; only the server
// may set the picture, and only to an address on a known music image host.
export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in first.");

  const body = await request.json().catch(() => null);
  const position = Number(body?.position);
  if (!Number.isInteger(position) || position < 1 || position > 3) return jsonError(400, "Unknown playlist.");

  const admin = createAdminClient();
  const { data: link } = await admin
    .from("profile_links")
    .select("url")
    .eq("user_id", session.userId)
    .eq("position", position)
    .maybeSingle();
  if (!link) return jsonError(404, "Unknown playlist.");

  let imageUrl: string | null = null;
  try {
    const lookup = oembedUrl(new URL(link.url));
    if (lookup) {
      const res = await fetch(lookup, { signal: AbortSignal.timeout(6000), cache: "no-store" });
      if (res.ok) {
        const info = (await res.json()) as { thumbnail_url?: unknown };
        if (typeof info.thumbnail_url === "string" && IMAGE_HOSTS.test(info.thumbnail_url)) imageUrl = info.thumbnail_url;
      }
    }
  } catch {
    // No picture is fine: the profile shows a plain tile for that playlist.
  }

  await admin.from("profile_links").update({ image_url: imageUrl }).eq("user_id", session.userId).eq("position", position);
  return NextResponse.json({ ok: true, imageUrl });
}
