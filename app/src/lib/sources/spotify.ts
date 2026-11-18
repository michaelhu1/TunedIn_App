import "server-only";

// Spotify, used for ONE thing: finding a song's Spotify link so "Open in Spotify" lands on
// the song itself. This uses the app's own credentials ("client credentials"), which needs
// no user login and is not subject to the 25-user cap that rules out reading people's
// listening from Spotify.

let token: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return token.value;
  } catch {
    return null;
  }
}

async function searchOne(q: string, bearer: string): Promise<string | null> {
  const res = await fetch(`https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${bearer}` },
    signal: AbortSignal.timeout(5000),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { tracks?: { items?: { id: string }[] } };
  return body.tracks?.items?.[0]?.id ?? null;
}

/**
 * The Spotify id for a song, or null if we cannot find it (the caller falls back to a
 * Spotify search link). The ISRC, a song's international id, gives an exact match when we
 * have it; otherwise we search by title and artist.
 */
export async function findSpotifyTrackId(track: { title: string; artist: string; isrc?: string | null }): Promise<string | null> {
  const bearer = await getToken();
  if (!bearer) return null;
  try {
    if (track.isrc) {
      const byIsrc = await searchOne(`isrc:${track.isrc}`, bearer);
      if (byIsrc) return byIsrc;
    }
    return await searchOne(`track:${track.title} artist:${track.artist}`, bearer);
  } catch {
    return null;
  }
}
