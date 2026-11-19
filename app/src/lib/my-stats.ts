import { listeningDay, windowStartDay } from "@/lib/listening-day";
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Your own listening, for the Me tab. Unlike the campus charts (which count each person
// once per song per day), this counts every play: it is your history, so repeats matter.
//
// It reads your most recent plays (row-level security guarantees they are only yours) and
// adds them up here. That is fine while histories are short. Once Autopilot users have
// thousands of plays this should move into a database function.

const MAX_PLAYS = 1000;

export type MyTrack = { trackId: string; title: string; artist: string; artworkUrl: string | null; plays: number };
export type MyArtist = { artist: string; artworkUrl: string | null; plays: number };
export type MyPlay = { trackId: string; title: string; artist: string; artworkUrl: string | null; playedAt: string };
export type MyStats = {
  totalPlays: number;
  differentSongs: number;
  differentArtists: number;
  activeDays: number;
  topTracks: MyTrack[];
  topArtists: MyArtist[];
  recent: MyPlay[];
  capped: boolean; // true if there were more plays than we looked at
};

type Row = {
  played_at: string;
  track: { id: string; title: string; artist: string; artwork_url: string | null } | null;
};

export async function getMyStats(supabase: SupabaseClient, userId: string, days: number | null): Promise<MyStats> {
  let query = supabase
    .from("plays")
    .select("played_at, track:tracks(id, title, artist, artwork_url)")
    .eq("user_id", userId)
    .order("played_at", { ascending: false })
    .limit(MAX_PLAYS);
  // Fetch one day more than needed; the exact cut by whole listening days happens below. (The
  // spare day also covers the 25-hour day when the clocks go back.)
  if (days) query = query.gte("played_at", new Date(Date.now() - (days + 1) * 86_400_000).toISOString());

  const { data } = await query;
  // Keep only whole listening days: today and the days - 1 before it. (Cutting by hours
  // alone once showed "8 days" for a week, because 7 x 24 hours touches eight calendar days.)
  const firstDay = days ? windowStartDay(days) : null;
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.track && (!firstDay || listeningDay(r.played_at) >= firstDay));

  const tracks = new Map<string, MyTrack>();
  const artists = new Map<string, MyArtist>();
  const dayKeys = new Set<string>();

  for (const r of rows) {
    const t = r.track!;
    const track = tracks.get(t.id) ?? { trackId: t.id, title: t.title, artist: t.artist, artworkUrl: t.artwork_url, plays: 0 };
    track.plays++;
    tracks.set(t.id, track);

    const artist = artists.get(t.artist) ?? { artist: t.artist, artworkUrl: t.artwork_url, plays: 0 };
    artist.plays++;
    artists.set(t.artist, artist);

    dayKeys.add(listeningDay(r.played_at));
  }

  // Most plays first; ties keep the more recently played one first (rows arrive newest first).
  const byPlays = <T extends { plays: number }>(m: Map<string, T>) => [...m.values()].sort((a, b) => b.plays - a.plays);

  return {
    totalPlays: rows.length,
    differentSongs: tracks.size,
    differentArtists: artists.size,
    activeDays: dayKeys.size,
    // Only things played more than once are ranked (the same rule as MIN_PLAYS_TO_RANK in
    // src/lib/charts.ts): a single play is not a favourite.
    topTracks: byPlays(tracks).filter((t) => t.plays >= 2).slice(0, 5),
    topArtists: byPlays(artists).filter((a) => a.plays >= 2).slice(0, 5),
    recent: rows.slice(0, 3).map((r) => ({
      trackId: r.track!.id,
      title: r.track!.title,
      artist: r.track!.artist,
      artworkUrl: r.track!.artwork_url,
      playedAt: r.played_at,
    })),
    capped: (data?.length ?? 0) === MAX_PLAYS,
  };
}
