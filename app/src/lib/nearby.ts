import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// The public map's data: busy areas and what is playing in each. Anonymous by construction:
// the database function returns totals and songs, never people (see *_public_map.sql).

export type AreaTrack = { track_id: string; title: string; artist: string; artwork_url: string | null; listeners: number };
export type Area = { cell: string; name: string; people: number; myArea: boolean; topTracks: AreaTrack[] };

export async function getNearbyAreas(supabase: SupabaseClient): Promise<Area[]> {
  const { data, error } = await supabase.rpc("nearby_areas");
  if (error) {
    console.error(`nearby_areas failed: ${error.message}`);
    return [];
  }
  return ((data ?? []) as { cell: string; name: string; people: number; my_area: boolean; top_tracks: AreaTrack[] | null }[]).map(
    (a) => ({ cell: a.cell, name: a.name, people: a.people, myArea: a.my_area, topTracks: a.top_tracks ?? [] }),
  );
}
