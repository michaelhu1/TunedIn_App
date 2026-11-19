import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listeningDay } from "@/lib/listening-day";

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

// ---------------------------------------------------------------------------
// Moments: a few things worth noticing about a friend, instead of a row for everyone
// ---------------------------------------------------------------------------

type MomentTrack = { id: string; title: string; artist: string; artworkUrl: string | null };
type Person = { userId: string; handle: string; name: string; avatarUrl: string | null };

export type Moment =
  /** A friend tapped "felt this" on your song in the last day. */
  | { kind: "felt"; key: string; friend: Person; track: MomentTrack }
  /** You and a friend both played the same song today. */
  | { kind: "same-song"; key: string; friend: Person; track: MomentTrack }
  /** Friends (and maybe you) are going to the same concert. */
  | { kind: "concert"; key: string; friends: Person[]; includesMe: boolean; artist: string; eventDate: string | null };

export type FriendsToday = {
  moments: Moment[];
  /** Listening in the last 30 minutes, closest overlap with you first. */
  onNow: FriendActivity[];
  earlier: FriendActivity[];
  quiet: FriendActivity[];
  /** "friendId:trackId" for every song you already tapped "felt this" on today. */
  feltByMe: string[];
};

const MAX_MOMENTS = 3;
const nameOf = (f: FriendActivity) => f.displayName ?? `@${f.handle}`;
const person = (f: FriendActivity): Person => ({ userId: f.userId, handle: f.handle, name: nameOf(f), avatarUrl: f.avatarUrl });

/**
 * Everything Home shows about friends. Friends are grouped by what they are doing (on now,
 * earlier today, quiet) and, inside each group, ordered by how much their recent listening
 * overlaps with yours. That order is only ever used on your own screen.
 */
export async function getFriendsToday(supabase: SupabaseClient, meId: string): Promise<FriendsToday> {
  const friends = await getFriendsActivity(supabase, meId);
  if (friends.length === 0) return { moments: [], onNow: [], earlier: [], quiet: [], feltByMe: [] };
  const byId = new Map(friends.map((f) => [f.userId, f]));
  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  // The app's day runs 4am to 4am in New York, the same rule the database uses.
  const today4am = listeningDay();

  const [same, overlap, concerts, received, sent] = await Promise.all([
    supabase.rpc("friend_same_songs_today"),
    supabase.rpc("friend_overlap"),
    supabase
      .from("profile_concerts")
      .select("user_id, artist, event_date")
      .eq("status", "going")
      .in("user_id", [meId, ...byId.keys()])
      .or(`event_date.gte.${today},event_date.is.null`),
    supabase
      .from("song_reactions")
      .select("sender_id, created_at, track:tracks(id, title, artist, artwork_url)")
      .eq("receiver_id", meId)
      .gt("created_at", dayAgo)
      .order("created_at", { ascending: false }),
    supabase.from("song_reactions").select("receiver_id, track_id").eq("sender_id", meId).eq("day", today4am),
  ]);

  const overlapById = new Map(((overlap.data ?? []) as { friend_id: string; shared_artists: number }[]).map((o) => [o.friend_id, o.shared_artists]));
  const closest = (a: FriendActivity, b: FriendActivity) =>
    (overlapById.get(b.userId) ?? 0) - (overlapById.get(a.userId) ?? 0) ||
    (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") ||
    a.handle.localeCompare(b.handle);

  const moments: Moment[] = [];

  // 1. Someone responded to you: the most personal thing on the screen, so it goes first.
  type ReceivedRow = { sender_id: string; track: { id: string; title: string; artist: string; artwork_url: string | null } | null };
  for (const r of (received.data ?? []) as unknown as ReceivedRow[]) {
    const f = byId.get(r.sender_id);
    if (!f || !r.track) continue;
    // The same friend and song can be stored twice either side of 4am; show it once.
    if (moments.some((m) => m.key === `felt:${f.userId}:${r.track!.id}`)) continue;
    moments.push({
      kind: "felt",
      key: `felt:${f.userId}:${r.track.id}`,
      friend: person(f),
      track: { id: r.track.id, title: r.track.title, artist: r.track.artist, artworkUrl: r.track.artwork_url },
    });
  }

  // 2. The same song on the same day. One per friend, closest friends first.
  type SameRow = { friend_id: string; track_id: string; title: string; artist: string; artwork_url: string | null };
  const seenFriend = new Set<string>();
  const sameRows = ((same.data ?? []) as SameRow[])
    .filter((r) => byId.has(r.friend_id))
    .sort((a, b) => closest(byId.get(a.friend_id)!, byId.get(b.friend_id)!));
  for (const r of sameRows) {
    if (seenFriend.has(r.friend_id)) continue;
    seenFriend.add(r.friend_id);
    moments.push({
      kind: "same-song",
      key: `same:${r.friend_id}:${r.track_id}`,
      friend: person(byId.get(r.friend_id)!),
      track: { id: r.track_id, title: r.title, artist: r.artist, artworkUrl: r.artwork_url },
    });
  }

  // 3. The same concert: two or more friends, or you and at least one friend.
  type ConcertRow = { user_id: string; artist: string; event_date: string | null };
  const byArtist = new Map<string, ConcertRow[]>();
  for (const c of (concerts.data ?? []) as ConcertRow[]) {
    // Artist and date together: two shows by the same artist are different concerts.
    const k = `${c.artist.trim().toLowerCase()}|${c.event_date ?? ""}`;
    byArtist.set(k, [...(byArtist.get(k) ?? []), c]);
  }
  for (const [k, rows] of byArtist) {
    const going = [...new Set(rows.filter((r) => r.user_id !== meId).map((r) => r.user_id))].map((id) => byId.get(id)!).filter(Boolean);
    const includesMe = rows.some((r) => r.user_id === meId);
    if (going.length + (includesMe ? 1 : 0) < 2 || going.length === 0) continue;
    moments.push({
      kind: "concert",
      key: `concert:${k}`,
      friends: going.sort(closest).map(person),
      includesMe,
      artist: rows[0].artist.trim(),
      eventDate: rows.find((r) => r.event_date)?.event_date ?? null,
    });
  }

  // Keep the screen short, but never let one kind crowd out the others: take them in turns.
  const picked: Moment[] = [];
  const queues = (["felt", "same-song", "concert"] as const).map((kind) => moments.filter((m) => m.kind === kind));
  while (picked.length < MAX_MOMENTS && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const next = q.shift();
      if (next && picked.length < MAX_MOMENTS) picked.push(next);
    }
  }

  return {
    moments: picked,
    onNow: friends.filter((f) => f.live).sort(closest),
    earlier: friends.filter((f) => f.track && !f.live).sort(closest),
    quiet: friends.filter((f) => !f.track).sort(closest),
    feltByMe: ((sent.data ?? []) as { receiver_id: string; track_id: string }[]).map((s) => `${s.receiver_id}:${s.track_id}`),
  };
}

/** "Maya", "Maya and Leo", "Maya, Leo and 3 others". */
export function namesLine(names: string[], shown = 2): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= shown) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const rest = names.length - shown;
  return `${names.slice(0, shown).join(", ")} and ${rest} other${rest === 1 ? "" : "s"}`;
}
