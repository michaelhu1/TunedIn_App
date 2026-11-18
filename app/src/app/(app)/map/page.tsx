import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import MapView, { type MapPerson } from "./map-view";

type PresenceRow = {
  user_id: string;
  geo_cell: string | null;
  updated_at: string;
  track: { id: string; title: string; artist: string; artwork_url: string | null } | null;
  profile: { handle: string } | null;
};

export default async function MapPage() {
  const me = await requireProfile();
  const supabase = await createClient();

  // Row-level security does the filtering: this returns my own row plus accepted friends
  // who are not in ghost mode and whose status has not expired. Nobody else, ever.
  const [{ data: rows }, { data: settings }, { count: friendCount }] = await Promise.all([
    supabase
      .from("presence")
      .select("user_id, geo_cell, updated_at, track:tracks(id, title, artist, artwork_url), profile:profiles(handle)")
      .gt("expires_at", new Date().toISOString()),
    supabase.from("user_settings").select("share_location, ghost_mode").eq("user_id", me.id).maybeSingle(),
    supabase.from("my_friendships").select("friend_id", { count: "exact", head: true }).eq("status", "accepted"),
  ]);

  const people: MapPerson[] = ((rows ?? []) as unknown as PresenceRow[]).map((r) => ({
    userId: r.user_id,
    handle: r.profile?.handle ?? "someone",
    isMe: r.user_id === me.id,
    cell: r.geo_cell,
    updatedAt: r.updated_at,
    track: r.track
      ? { id: r.track.id, title: r.track.title, artist: r.track.artist, artworkUrl: r.track.artwork_url }
      : null,
  }));

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Map</h1>
      <MapView
        myId={me.id}
        people={people}
        friendCount={friendCount ?? 0}
        shareLocation={settings?.share_location ?? false}
        ghostMode={settings?.ghost_mode ?? false}
      />
    </main>
  );
}
