import "server-only";

// Artist lookups for the "pick your favourite artists" step. Deezer needs no key.

export type ArtistPick = { name: string; pictureUrl: string | null };

type DeezerArtist = { name: string; picture_medium?: string };

async function get(url: string, revalidate?: number): Promise<DeezerArtist[]> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      ...(revalidate ? { next: { revalidate } } : { cache: "no-store" as const }),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: DeezerArtist[] };
    return body.data ?? [];
  } catch {
    return [];
  }
}

const toPick = (a: DeezerArtist): ArtistPick => ({ name: a.name, pictureUrl: a.picture_medium ?? null });

/** Popular artists right now, to tap without typing. Cached for an hour. */
export async function getPopularArtists(limit = 18): Promise<ArtistPick[]> {
  return (await get(`https://api.deezer.com/chart/0/artists?limit=${limit}`, 3600)).map(toPick);
}

export async function searchArtists(query: string, limit = 8): Promise<ArtistPick[]> {
  return (await get(`https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=${limit}`)).map(toPick);
}

/**
 * The catalogue's own spelling of an artist name, or null if there is no such artist.
 * Used before saving, so profiles only ever hold real artist names and never free text.
 */
export async function canonicalArtistName(name: string): Promise<string | null> {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  const results = await searchArtists(name, 5);
  return results.find((a) => a.name.trim().toLowerCase() === wanted)?.name ?? null;
}
