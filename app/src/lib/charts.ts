import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Typed wrappers around the chart functions in supabase/migrations/*_charts.sql.
// Counting rule: one person counts once per song per day. `points` are listener-days,
// `listeners` are different people in the window.

export type ChartStatus = { listeners: number; required: number; unlocked: boolean };
export type TrackRow = {
  rank: number; track_id: string; title: string; artist: string;
  artwork_url: string | null; listeners: number; points: number;
};
export type ArtistRow = { rank: number; artist: string; artwork_url: string | null; listeners: number; points: number };
export type SchoolRow = {
  rank: number | null; slug: string; short_name: string; name: string; members: number;
  listeners: number; points: number | null; points_per_member: number | null;
  unlocked: boolean; required: number;
};
export type ListenerRow = {
  rank: number; handle: string; school: string; avatar_url: string | null; points: number; automatic: boolean;
};

async function rpc<T>(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    // Most likely the database is behind the code (migration not pushed yet).
    console.error(`chart query ${fn} failed: ${error.message}`);
    return [];
  }
  return (data ?? []) as T[];
}

export async function getChartStatus(supabase: SupabaseClient, school: string | null, days = 7): Promise<ChartStatus> {
  const rows = await rpc<ChartStatus>(supabase, "chart_status", { p_school_slug: school, p_days: days });
  return rows[0] ?? { listeners: 0, required: 5, unlocked: false };
}
export const getTopTracks = (s: SupabaseClient, school: string | null, days = 7, limit = 25) =>
  rpc<TrackRow>(s, "chart_top_tracks", { p_school_slug: school, p_days: days, p_limit: limit });
export const getTopArtists = (s: SupabaseClient, school: string | null, days = 7, limit = 10) =>
  rpc<ArtistRow>(s, "chart_top_artists", { p_school_slug: school, p_days: days, p_limit: limit });
export const getSchools = (s: SupabaseClient, days = 7) => rpc<SchoolRow>(s, "chart_schools", { p_days: days });
export const getTopListeners = (s: SupabaseClient, school: string | null, days = 7, limit = 10) =>
  rpc<ListenerRow>(s, "chart_top_listeners", { p_school_slug: school, p_days: days, p_limit: limit });

// --- Friends chart: you plus friends who show their stats (see *_friends_charts.sql) ---
export type FriendTrackRow = TrackRow & { handles: string[] };
export type FriendArtistRow = ArtistRow & { handles: string[] };
export const getFriendsTopTracks = (s: SupabaseClient, days = 7, limit = 20) =>
  rpc<FriendTrackRow>(s, "chart_friends_top_tracks", { p_days: days, p_limit: limit });
export const getFriendsTopArtists = (s: SupabaseClient, days = 7, limit = 5) =>
  rpc<FriendArtistRow>(s, "chart_friends_top_artists", { p_days: days, p_limit: limit });
