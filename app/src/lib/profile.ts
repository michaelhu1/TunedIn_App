import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Everything a profile page shows, loaded in one place. Both the public profile page and
// the editor use this, so they can never disagree about what a profile contains.
//
// Privacy is decided by the database, not here: the queries run as the signed-in viewer,
// and the stats functions return nothing unless the owner allows it (see
// supabase/migrations/*_profiles.sql).

export const MAX_FAVORITES = 4;
export const MAX_LINKS = 3;
export const BIO_MAX = 160;
export const DISPLAY_NAME_MAX = 40;

/** Music services a playlist link may point to. Mirrors the database check constraint. */
export const LINK_HOSTS = [
  "open.spotify.com",
  "music.apple.com",
  "music.youtube.com",
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "soundcloud.com",
  "on.soundcloud.com",
  "deezer.com",
  "www.deezer.com",
  "tidal.com",
] as const;

export type ProfileTrack = { trackId: string; title: string; artist: string; artworkUrl: string | null };
export type ProfileFavorite = ProfileTrack & { position: number };
export type ProfileLink = { position: number; title: string; url: string };
export type ProfileTopTrack = ProfileTrack & { plays: number };
export type ProfileTopArtist = { artist: string; artworkUrl: string | null; plays: number };

export type FullProfile = {
  id: string;
  handle: string;
  displayName: string | null;
  bio: string | null;
  classYear: number | null;
  avatarUrl: string | null;
  showStats: boolean;
  school: { id: string; name: string; shortName: string; slug: string };
  favorites: ProfileFavorite[];
  links: ProfileLink[];
  /** Empty when the owner hides stats or is in ghost mode (unless you are the owner). */
  topTracks: ProfileTopTrack[];
  topArtists: ProfileTopArtist[];
  /** Their song today, if the viewer is allowed to see it (themselves or a friend). */
  nowPlaying: (ProfileTrack & { updatedAt: string }) | null;
};

type TrackJoin = { id: string; title: string; artist: string; artwork_url: string | null };
const toTrack = (t: TrackJoin): ProfileTrack => ({ trackId: t.id, title: t.title, artist: t.artist, artworkUrl: t.artwork_url });

/** Load a profile by handle as the signed-in viewer. Null if nobody has that handle. */
export async function getFullProfile(supabase: SupabaseClient, handle: string): Promise<FullProfile | null> {
  const { data: p } = await supabase
    .from("profiles")
    .select("id, handle, display_name, bio, class_year, avatar_url, show_stats, school:schools(id, name, short_name, slug)")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();
  if (!p) return null;

  const [favs, links, topTracks, topArtists, presence] = await Promise.all([
    supabase
      .from("profile_favorites")
      .select("position, track:tracks(id, title, artist, artwork_url)")
      .eq("user_id", p.id)
      .order("position"),
    supabase.from("profile_links").select("position, title, url").eq("user_id", p.id).order("position"),
    supabase.rpc("profile_top_tracks", { p_user_id: p.id, p_limit: 5 }),
    supabase.rpc("profile_top_artists", { p_user_id: p.id, p_limit: 5 }),
    supabase
      .from("presence")
      .select("updated_at, track:tracks(id, title, artist, artwork_url)")
      .eq("user_id", p.id)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle(),
  ]);

  const school = p.school as unknown as { id: string; name: string; short_name: string; slug: string };
  const presenceRow = presence.data as unknown as { updated_at: string; track: TrackJoin | null } | null;

  return {
    id: p.id,
    handle: p.handle,
    displayName: p.display_name,
    bio: p.bio,
    classYear: p.class_year,
    avatarUrl: p.avatar_url,
    showStats: p.show_stats,
    school: { id: school.id, name: school.name, shortName: school.short_name, slug: school.slug },
    favorites: ((favs.data ?? []) as unknown as { position: number; track: TrackJoin | null }[])
      .filter((f) => f.track)
      .map((f) => ({ position: f.position, ...toTrack(f.track!) })),
    links: (links.data ?? []) as ProfileLink[],
    topTracks: ((topTracks.data ?? []) as { track_id: string; title: string; artist: string; artwork_url: string | null; plays: number }[]).map(
      (t) => ({ trackId: t.track_id, title: t.title, artist: t.artist, artworkUrl: t.artwork_url, plays: t.plays }),
    ),
    topArtists: ((topArtists.data ?? []) as { artist: string; artwork_url: string | null; plays: number }[]).map((a) => ({
      artist: a.artist,
      artworkUrl: a.artwork_url,
      plays: a.plays,
    })),
    nowPlaying: presenceRow?.track ? { ...toTrack(presenceRow.track), updatedAt: presenceRow.updated_at } : null,
  };
}
