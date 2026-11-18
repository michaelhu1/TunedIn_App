import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMetadataSource } from "@/lib/sources";
import type { TrackMetadata, TrackRef } from "@/lib/sources/types";

const key = (s: string) => s.trim().toLowerCase();

/**
 * Turn an "artist + title" from any source into the id of one canonical row in `tracks`.
 *
 *   1. Seen this exact spelling before? Use the remembered answer (no network call).
 *   2. Otherwise ask the metadata source. If it recognises the song we store its clean
 *      name, art and ids. If not, we store the raw text so the play still counts.
 *   3. Remember the spelling so step 2 never repeats for it.
 *
 * `requireMatch` is for manual check-ins: refuse songs the metadata source does not know,
 * so people cannot write arbitrary text into the shared track list.
 */
export async function resolveTrack(
  admin: SupabaseClient,
  ref: TrackRef,
  opts: { requireMatch?: boolean } = {},
): Promise<string | null> {
  const artistKey = key(ref.artist);
  const titleKey = key(ref.title);

  const { data: alias } = await admin
    .from("track_aliases")
    .select("track_id")
    .eq("artist_key", artistKey)
    .eq("title_key", titleKey)
    .maybeSingle();
  if (alias) return alias.track_id;

  const found: TrackMetadata | null = await getMetadataSource().lookup(ref);
  if (!found && opts.requireMatch) return null;
  const track: TrackMetadata = found ?? ref;

  const { data: trackId, error } = await admin.rpc("upsert_track", {
    p_title: track.title,
    p_artist: track.artist,
    p_album: track.album ?? null,
    p_isrc: track.isrc ?? null,
    p_artwork_url: track.artworkUrl ?? null,
    // Deezer preview links expire after about 15 minutes, so they are fetched fresh when
    // someone presses play instead of being stored.
    p_preview_url: null,
    p_deezer_id: track.deezerId ?? null,
    p_itunes_id: track.itunesId ?? null,
    p_spotify_id: track.spotifyId ?? null,
  });
  if (error) throw new Error(`Could not save track: ${error.message}`);

  // Two requests can race to record the same spelling; the second one is a harmless no-op.
  await admin
    .from("track_aliases")
    .upsert(
      { artist_key: artistKey, title_key: titleKey, track_id: trackId },
      { onConflict: "artist_key,title_key", ignoreDuplicates: true },
    );
  return trackId as string;
}
