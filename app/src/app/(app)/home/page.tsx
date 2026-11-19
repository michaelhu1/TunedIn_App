import Link from "next/link";
import AutopilotSync from "@/components/autopilot-sync";
import { requireProfile } from "@/lib/auth";
import { getTopTracks } from "@/lib/charts";
import { getGlobalChart } from "@/lib/sources/deezer-chart";
import { createClient } from "@/lib/supabase/server";
import Cover from "@/components/cover";
import OpenInSpotify from "@/components/open-in-spotify";
import PreviewButton from "@/components/preview-button";
import QuickPicks, { type Pick } from "@/components/quick-picks";

const LIVE_MINUTES = 30;
const AUTOPILOT_AFTER_CHECKINS = 5;

type TrackJoin = { id: string; title: string; artist: string; artwork_url: string | null };

function ago(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
}

export default async function HomePage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [presenceRes, recentRes, settingsRes, campus] = await Promise.all([
    supabase
      .from("presence")
      .select("updated_at, track:tracks(id, title, artist, artwork_url)")
      .eq("user_id", profile.id)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle(),
    supabase
      .from("plays")
      .select("source, track:tracks(id, title, artist, artwork_url)")
      .eq("user_id", profile.id)
      .order("played_at", { ascending: false })
      .limit(40),
    supabase.from("user_settings").select("lastfm_username").eq("user_id", profile.id).maybeSingle(),
    getTopTracks(supabase, null, 7, 9),
  ]);

  const presence = presenceRes.data as unknown as { updated_at: string; track: TrackJoin | null } | null;
  const plays = (recentRes.data ?? []) as unknown as { source: string; track: TrackJoin | null }[];
  const isNew = plays.length === 0;

  // Your last few different songs, newest first.
  const recents: Pick[] = [];
  for (const p of plays) {
    if (!p.track || recents.some((r) => r.trackId === p.track!.id)) continue;
    recents.push({ trackId: p.track.id, title: p.track.title, artist: p.track.artist, artworkUrl: p.track.artwork_url });
    if (recents.length === 3) break;
  }

  // Campus chart if it has unlocked, otherwise what the world is playing.
  const trending: Pick[] = campus.length
    ? campus.map((t) => ({ trackId: t.track_id, title: t.title, artist: t.artist, artworkUrl: t.artwork_url }))
    : await getGlobalChart(9);
  const trendingLabel = campus.length ? "Trending at NYU" : "Popular right now";

  const live = presence && Date.now() - new Date(presence.updated_at).getTime() < LIVE_MINUTES * 60000;
  const checkins = plays.filter((p) => p.source === "checkin").length;
  const offerAutopilot = !settingsRes.data?.lastfm_username && checkins >= AUTOPILOT_AFTER_CHECKINS;

  return (
    <main className="flex flex-col gap-6">
      <AutopilotSync />
      <header>
        <h1 className="text-2xl font-bold">
          {isNew ? "What's playing right now?" : `Hey @${profile.handle}`}
        </h1>
        {isNew && (
          <p className="mt-1 text-sm opacity-70">
            Tap a song to check in. It counts for {profile.school.short_name} on the NYU charts.
          </p>
        )}
      </header>

      {presence?.track && (
        <section className="flex items-center gap-3 rounded-xl border border-foreground/15 p-3">
          <Cover src={presence.track.artwork_url} size={56} />
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide opacity-60">
              {live ? "● Live now" : `Earlier today · ${ago(presence.updated_at)}`}
            </p>
            <p className="truncate font-semibold">{presence.track.title}</p>
            <p className="truncate text-sm opacity-70">{presence.track.artist}</p>
          </div>
          <PreviewButton trackId={presence.track.id} />
          <OpenInSpotify trackId={presence.track.id} compact />
        </section>
      )}

      <Link href="/checkin" className="field block text-foreground/50">
        Search for a song
      </Link>

      <QuickPicks
        sections={[
          { label: "Again", picks: recents },
          { label: trendingLabel, picks: trending },
        ]}
      />

      {offerAutopilot && (
        <section className="rounded-xl border border-foreground/15 p-4 text-sm">
          <p className="font-semibold">Tired of tapping?</p>
          <p className="mt-1 opacity-70">
            Autopilot counts every Spotify play for you through Last.fm. It takes about two minutes to set up.
          </p>
          <Link href="/me" className="mt-2 inline-block underline">
            Set up Autopilot
          </Link>
        </section>
      )}
    </main>
  );
}
