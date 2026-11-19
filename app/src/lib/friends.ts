import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// What your friends are playing, for Home and the People tab.
//
// "Activity" here is each friend's song for today: the same thing the map shows. The query
// runs as the signed-in viewer, so row-level security decides what comes back: accepted
// friends only, never anyone in ghost mode.

export const LIVE_MINUTES = 30;

export type FriendActivity = {
  userId: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** Their song today, or null if they have not played or set anything yet. */
  track: { id: string; title: string; artist: string; artworkUrl: string | null } | null;
  updatedAt: string | null;
  live: boolean;
};

type PresenceRow = {
  user_id: string;
  updated_at: string;
  track: { id: string; title: string; artist: string; artwork_url: string | null } | null;
};
type FriendRow = { friend_id: string; handle: string; avatar_url: string | null };

/** Every accepted friend, most recently active first; friends with nothing today come last. */
export async function getFriendsActivity(supabase: SupabaseClient, meId: string): Promise<FriendActivity[]> {
  const [{ data: friends }, { data: presence }] = await Promise.all([
    supabase.from("my_friendships").select("friend_id, handle, avatar_url").eq("status", "accepted"),
    supabase
      .from("presence")
      .select("user_id, updated_at, track:tracks(id, title, artist, artwork_url)")
      .neq("user_id", meId)
      .gt("expires_at", new Date().toISOString()),
  ]);

  const friendRows = (friends ?? []) as FriendRow[];
  if (friendRows.length === 0) return [];

  // Display names are not in the friendships view, so fetch them for these friends.
  const { data: names } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", friendRows.map((f) => f.friend_id));
  const nameById = new Map((names ?? []).map((n) => [n.id as string, n.display_name as string | null]));
  const presenceById = new Map(((presence ?? []) as unknown as PresenceRow[]).map((p) => [p.user_id, p]));

  return friendRows
    .map((f): FriendActivity => {
      const p = presenceById.get(f.friend_id);
      const track = p?.track
        ? { id: p.track.id, title: p.track.title, artist: p.track.artist, artworkUrl: p.track.artwork_url }
        : null;
      const updatedAt = track ? p!.updated_at : null;
      return {
        userId: f.friend_id,
        handle: f.handle,
        displayName: nameById.get(f.friend_id) ?? null,
        avatarUrl: f.avatar_url,
        track,
        updatedAt,
        live: updatedAt !== null && Date.now() - new Date(updatedAt).getTime() < LIVE_MINUTES * 60_000,
      };
    })
    .sort((a, b) => {
      if (a.updatedAt && b.updatedAt) return b.updatedAt.localeCompare(a.updatedAt);
      if (a.updatedAt) return -1;
      if (b.updatedAt) return 1;
      return a.handle.localeCompare(b.handle);
    });
}

/** Friend requests waiting for me to answer. Drives the red badge. */
export async function getPendingRequestCount(supabase: SupabaseClient): Promise<number> {
  const { count } = await supabase
    .from("my_friendships")
    .select("friend_id", { count: "exact", head: true })
    .eq("status", "pending")
    .eq("sent_by_me", false);
  return count ?? 0;
}

export function timeAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
}
