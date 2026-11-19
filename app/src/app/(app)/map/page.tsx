import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getNearbyAreas } from "@/lib/nearby";
import LocationOptIn from "@/components/location-opt-in";
import LocationPing from "@/components/location-ping";
import AutopilotSync from "@/components/autopilot-sync";
import { createClient } from "@/lib/supabase/server";
import MapView, { type MapPerson } from "./map-view";
import PublicMapView from "./public-map-view";

type PresenceRow = {
  user_id: string;
  geo_cell: string | null;
  updated_at: string;
  track: { id: string; title: string; artist: string; artwork_url: string | null } | null;
  profile: { handle: string; display_name: string | null; avatar_url: string | null } | null;
};

// Two maps on one tab:
//   Friends: individual friends, each in their zone, with their song.
//   Public:  busy AREAS and what is playing there. Anonymous, and only with enough people.
export default async function MapPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const me = await requireProfile();
  const supabase = await createClient();
  const view = (await searchParams).view === "public" ? "public" : "friends";

  const tabs = (
    <nav aria-label="Map view" className="flex gap-2 text-sm">
      {(["friends", "public"] as const).map((v) => (
        <Link
          key={v}
          href={v === "friends" ? "/map" : "/map?view=public"}
          aria-current={view === v ? "page" : undefined}
          className={`rounded-full border px-4 py-1.5 ${
            view === v ? "border-foreground bg-foreground text-background" : "border-foreground/20"
          }`}
        >
          {v === "friends" ? "Friends" : "Public"}
        </Link>
      ))}
    </nav>
  );

  if (view === "public") {
    const [areas, { data: settings }, { data: minPeople }] = await Promise.all([
      getNearbyAreas(supabase),
      supabase.from("user_settings").select("share_location, ghost_mode").eq("user_id", me.id).maybeSingle(),
      supabase.rpc("nearby_min_people"),
    ]);
    const sharing = Boolean(settings?.share_location) && !settings?.ghost_mode;
    return (
      <main className="flex flex-col gap-4">
        <AutopilotSync />
        {/* On the map screens we may ask for location; elsewhere we only use it if already allowed. */}
        {sharing && <LocationPing ask />}
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Around here</h1>
          {tabs}
        </header>
        <PublicMapView areas={areas} minPeople={typeof minPeople === "number" ? minPeople : 5} />
        {!settings?.share_location && !settings?.ghost_mode && <LocationOptIn userId={me.id} />}
      </main>
    );
  }

  // Row-level security does the filtering: this returns my own row plus accepted friends
  // who are not in ghost mode and whose status has not expired. Nobody else, ever.
  const [{ data: rows }, { data: settings }, { count: friendCount }] = await Promise.all([
    supabase
      .from("presence")
      .select("user_id, geo_cell, updated_at, track:tracks(id, title, artist, artwork_url), profile:profiles(handle, display_name, avatar_url)")
      .gt("expires_at", new Date().toISOString()),
    supabase.from("user_settings").select("share_location, ghost_mode").eq("user_id", me.id).maybeSingle(),
    supabase.from("my_friendships").select("friend_id", { count: "exact", head: true }).eq("status", "accepted"),
  ]);

  const people: MapPerson[] = ((rows ?? []) as unknown as PresenceRow[]).map((r) => ({
    userId: r.user_id,
    handle: r.profile?.handle ?? "someone",
    displayName: r.profile?.display_name ?? null,
    avatarUrl: r.profile?.avatar_url ?? null,
    isMe: r.user_id === me.id,
    cell: r.geo_cell,
    updatedAt: r.updated_at,
    track: r.track
      ? { id: r.track.id, title: r.track.title, artist: r.track.artist, artworkUrl: r.track.artwork_url }
      : null,
  }));

  return (
    <main className="flex flex-col gap-4">
      <AutopilotSync />
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Friends</h1>
        {tabs}
      </header>
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
