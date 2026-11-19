import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getChartStatus, getTopTracks } from "@/lib/charts";
import { LIVE_MINUTES, getFriendsActivity, getPendingRequestCount, timeAgo } from "@/lib/friends";
import { getNearbyAreas } from "@/lib/nearby";
import { createClient } from "@/lib/supabase/server";
import AutopilotSync from "@/components/autopilot-sync";
import Avatar from "@/components/avatar";
import Cover from "@/components/cover";
import FriendActivityList from "@/components/friend-activity-list";
import LocationPing from "@/components/location-ping";
import OpenInSpotify from "@/components/open-in-spotify";
import PreviewButton from "@/components/preview-button";
import ShareButton from "@/components/share-button";
import { matchLabel, reasonsFor, type Suggestion } from "@/components/discover/reasons";

type TrackJoin = { id: string; title: string; artist: string; artwork_url: string | null };

// Home is the app in one screen: what is everyone playing right now?
//   1. You: your song today.
//   2. Your friends: what each of them is on, live first.
//   3. People you might click with: a short row of suggestions.
//   4. Around you: how many people are listening in your area and to what (anonymous).
//   5. Your campus: the top few songs at NYU this week.
// "Friends" (top right) leads to the page for adding and removing people and answering
// requests, and carries a red badge when someone is waiting on you.
//
// TunedIn does not play music, so there is nothing here to browse or queue. Setting a song
// by hand is one small link for people who have not connected a streaming service.
export default async function HomePage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [presenceRes, settingsRes, friends, pending, suggestedRes, campus, campusStatus, areas] = await Promise.all([
    supabase
      .from("presence")
      .select("updated_at, track:tracks(id, title, artist, artwork_url)")
      .eq("user_id", profile.id)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle(),
    supabase.from("user_settings").select("lastfm_username, share_location, ghost_mode").eq("user_id", profile.id).maybeSingle(),
    getFriendsActivity(supabase, profile.id),
    getPendingRequestCount(supabase),
    supabase.rpc("people_you_might_click_with", { p_limit: 8 }),
    getTopTracks(supabase, null, 7, 5),
    getChartStatus(supabase, null),
    getNearbyAreas(supabase),
  ]);

  const presence = presenceRes.data as unknown as { updated_at: string; track: TrackJoin | null } | null;
  const live = presence && Date.now() - new Date(presence.updated_at).getTime() < LIVE_MINUTES * 60_000;
  const connected = Boolean(settingsRes.data?.lastfm_username);
  const people = (suggestedRes.data ?? []) as Suggestion[];
  const sharingLocation = Boolean(settingsRes.data?.share_location) && !settingsRes.data?.ghost_mode;
  // The area you are in, if it is busy enough to show; otherwise the busiest one anywhere.
  const area = areas.find((a) => a.myArea) ?? areas[0] ?? null;

  return (
    <main className="flex flex-col gap-7">
      <AutopilotSync />
      {/* Keeps your rough location fresh, but only if you share it and the browser already has permission. */}
      {sharingLocation && <LocationPing />}

      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">TunedIn</h1>
        <Link
          href="/friends"
          className="relative rounded-full border border-foreground/20 px-4 py-2 text-sm font-semibold"
          aria-label={pending > 0 ? `Friends, ${pending} request${pending === 1 ? "" : "s"} waiting` : "Friends: add, remove and requests"}
        >
          Friends
          {pending > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
              {pending}
            </span>
          )}
        </Link>
      </header>

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-wide opacity-60">You</h2>
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
        <h2 className="mb-1 text-xs uppercase tracking-wide opacity-60">Friends today</h2>
        {friends.length === 0 ? (
          <div className="rounded-xl border border-foreground/15 p-4 text-sm">
            <p className="font-semibold">This is where your friends&apos; music shows up.</p>
            <p className="mt-1 opacity-70">
              Add people by their handle, or start with the suggestions below. Once they accept, you will see
              what each of them is playing.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <ShareButton path={`/invite/${profile.handle}`} title="Join me on TunedIn" label="Invite a friend" />
              <Link href="/friends" className="underline">
                Add by handle
              </Link>
            </div>
          </div>
        ) : (
          <FriendActivityList friends={friends} />
        )}
      </section>

      {people.length > 0 && (
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-xs uppercase tracking-wide opacity-60">People you might click with</h2>
            <Link href="/discover" className="text-sm underline opacity-70">
              See all
            </Link>
          </div>
          {/* A row that scrolls sideways. Each card links to the full profile. */}
          <ul className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-2">
            {people.map((p) => {
              const match = matchLabel(p);
              const reason = reasonsFor(p, 1)[0];
              return (
                <li key={p.user_id} className="w-40 shrink-0 snap-start">
                  <Link
                    href={`/u/${p.handle}`}
                    className="flex h-full flex-col items-center gap-2 rounded-xl border border-foreground/15 p-3 text-center"
                  >
                    <Avatar handle={p.handle} src={p.avatar_url} size={56} />
                    <p className="w-full truncate text-sm font-semibold">{p.display_name ?? `@${p.handle}`}</p>
                    {match && (
                      <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-semibold text-background">{match}</span>
                    )}
                    {reason && <p className="line-clamp-3 text-xs opacity-70">{reason}</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {area && (
        <section>
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="text-xs uppercase tracking-wide opacity-60">{area.myArea ? "Around you" : "Busiest right now"}</h2>
            <Link href="/map?view=public" className="text-sm underline opacity-70">
              Public map
            </Link>
          </div>
          <Link href="/map?view=public" className="flex items-center gap-3 rounded-xl border border-foreground/15 p-3">
            <Cover src={area.topTracks[0]?.artwork_url ?? null} size={48} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {area.name} · {area.people} listening
              </p>
              {area.topTracks[0] && (
                <p className="truncate text-sm opacity-70">
                  Top: {area.topTracks[0].title} · {area.topTracks[0].artist}
                </p>
              )}
            </div>
          </Link>
        </section>
      )}

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
