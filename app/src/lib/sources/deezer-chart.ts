import "server-only";

// Deezer's global chart: what the check-in grid shows when the campus chart is still empty
// (day one, or a brand new school). Cached for an hour by Next.js.

export type ChartPick = { title: string; artist: string; artworkUrl: string | null; deezerId: number };

export async function getGlobalChart(limit = 9): Promise<ChartPick[]> {
  try {
    const res = await fetch(`https://api.deezer.com/chart/0/tracks?limit=${limit}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      data?: { id: number; title: string; artist: { name: string }; album: { cover_big?: string } }[];
    };
    return (body.data ?? []).map((t) => ({
      title: t.title,
      artist: t.artist.name,
      artworkUrl: t.album.cover_big ?? null,
      deezerId: t.id,
    }));
  } catch {
    return []; // The grid just shows fewer picks; search still works.
  }
}
