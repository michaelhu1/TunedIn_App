import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getChartStatus, getTopTracks } from "@/lib/charts";
import { LIVE_MINUTES, getFriendsActivity, timeAgo } from "@/lib/friends";
import { createClient } from "@/lib/supabase/server";
import AutopilotSync from "@/components/autopilot-sync";
import Cover from "@/components/cover";
import FriendActivityList from "@/components/friend-activity-list";
import OpenInSpotify from "@/components/open-in-spotify";
import PreviewButton from "@/components/preview-button";

type TrackJoin = { id: string; title: string; artist: string; artwork_url: string | null };

// Home answers the question the app exists for: what is everyone playing right now?
//   1. You: your song today.
//   2. Your friends: what each of them is on.
//   3. Your campus: the top few songs at NYU this week.
// TunedIn does not play music, so there is nothing here to browse or queue. Setting a song
// by hand is one small link for people who have not connected a streaming service.
export default async function HomePage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [presenceRes, settingsRes, friends, campus, campusStatus] = await Promise.all([
    supabase
      .from("presence")
      .select("updated_at, track:tracks(id, title, artist, artwork_url)")
      .eq("user_id", profile.id)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle(),
    supabase.from("user_settings").select("lastfm_username").eq("user_id", profile.id).maybeSingle(),
    getFriendsActivity(supabase, profile.id),
    getTopTracks(supabase, null, 7, 5),
    getChartStatus(supabase, null),
  ]);

  const presence = presenceRes.data as unknown as { updated_at: string; track: TrackJoin | null } | null;
  const live = presence && Date.now() - new Date(presence.updated_at).getTime() < LIVE_MINUTES * 60_000;
  const connected = Boolean(settingsRes.data?.lastfm_username);
  const active = friends.filter((f) => f.track);

  return (
    <main className="flex flex-col gap-7">
      <AutopilotSync />

      <section>
        <h1 className="mb-2 text-xs uppercase tracking-wide opacity-60">You</h1>
        <div className="flex items-center gap-3 rounded-xl border border-foreground/15 p-3">
          <Cover src={presence?.track?.artwork_url ?? null} size={56} />
          <div className="min-w-0 flex-1">
            {presence?.track ? (
              <>
                <p className="text-xs opacity-60">{live ? "● Listening now" : `Earlier today · ${timeAgo(presence.updated_at)}`}</p>
                <p className="truncate font-semibold">{presence.track.title}</p>
                <p className="truncate text-sm opacity-70">{presence.track.artist}</p>
              </>
            ) : (
              <>
                <p className="font-semibold">Nothing playing yet today</p>
                <p className="text-sm opacity-70">
                  {connected ? "Play something on Spotify and it shows up here." : "Connect your music to fill this in."}
                </p>
              </>
            )}
          </div>
          {presence?.track && (
            <>
              <PreviewButton trackId={presence.track.id} />
              <OpenInSpotify trackId={presence.track.id} compact />
            </>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {!connected && (
            <Link href="/connect" className="font-semibold underline">
              Connect Spotify through Last.fm
            </Link>
          )}
          <Link href="/checkin" className="underline opacity-70">
            Set a song by hand
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-xs uppercase tracking-wide opacity-60">Friends today</h2>
          {friends.length > 0 && (
            <Link href="/people" className="text-sm underline opacity-70">
              All friends
            </Link>
          )}
        </div>
        {friends.length === 0 ? (
          <div className="rounded-xl border border-foreground/15 p-4 text-sm">
            <p className="font-semibold">This is where your friends&apos; music shows up.</p>
            <p className="mt-1 opacity-70">Add a few people and you will see what each of them is playing.</p>
            <Link href="/people" className="btn mt-3 block">
              Find people
            </Link>
          </div>
        ) : active.length === 0 ? (
          <p className="text-sm opacity-60">None of your friends have played anything yet today.</p>
        ) : (
          <FriendActivityList friends={active.slice(0, 5)} activeOnly />
        )}
      </section>

      <section>
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-xs uppercase tracking-wide opacity-60">NYU this week</h2>
          <Link href="/charts" className="text-sm underline opacity-70">
            Charts
          </Link>
        </div>
        {campus.length === 0 ? (
          <p className="text-sm opacity-60">
            The NYU chart unlocks at {campusStatus.required} listeners. {campusStatus.listeners} so far.
          </p>
        ) : (
          <ol className="flex flex-col">
            {campus.map((t) => (
              <li key={t.track_id} className="flex items-center gap-3 py-2">
                <span className="w-4 text-right text-sm tabular-nums opacity-60">{t.rank}</span>
                <Cover src={t.artwork_url} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="truncate text-xs opacity-70">{t.artist}</p>
                </div>
                <PreviewButton trackId={t.track_id} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
