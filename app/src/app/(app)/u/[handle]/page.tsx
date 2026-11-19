import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getFullProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { HANDLE_PATTERN } from "@/lib/validation";
import Avatar from "@/components/avatar";
import FriendButton, { type FriendState } from "@/components/profile/friend-button";
import { Favorites, NowPlaying, Playlists, TopArtists, TopSongs } from "@/components/profile/sections";

type Props = { params: Promise<{ handle: string }> };

// The tab title comes from the address only, so it costs no database query. It is not
// sensitive: whoever opened the page already typed or tapped that handle.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const handle = (await params).handle.toLowerCase();
  return { title: HANDLE_PATTERN.test(handle) ? `@${handle} · TunedIn` : "TunedIn" };
}

// A member's profile, as another member (or they themselves) sees it.
// What appears is decided by the database: getFullProfile runs as the viewer, so hidden
// stats come back empty and "now playing" only arrives for the owner or a friend.
export default async function ProfilePage({ params }: Props) {
  const viewer = await requireProfile(); // signed-out visitors go to /login
  // Check the shape before touching the database, so junk in the address never reaches a query.
  const handle = (await params).handle.toLowerCase();
  if (!HANDLE_PATTERN.test(handle)) notFound();

  const supabase = await createClient();
  const profile = await getFullProfile(supabase, handle);
  if (!profile) notFound();

  const isOwner = profile.id === viewer.id;
  const friendState = isOwner ? null : await getFriendState(supabase, profile.id);

  const hasStats = profile.topTracks.length > 0 || profile.topArtists.length > 0;
  const isEmpty = !profile.bio && profile.favorites.length === 0 && profile.links.length === 0 && !hasStats;
  const name = profile.displayName ?? `@${profile.handle}`;

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <Avatar handle={profile.handle} src={profile.avatarUrl} size={88} />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">{name}</h1>
            {/* Without a display name the heading already is the handle, so do not repeat it. */}
            {profile.displayName && <p className="truncate opacity-60">@{profile.handle}</p>}
            <p className="text-sm opacity-70">
              {profile.school.name}
              {profile.classYear && <> · Class of {profile.classYear}</>}
            </p>
          </div>
        </div>
        {/* Plain text only; whitespace-pre-line keeps the owner's line breaks. */}
        {profile.bio && <p className="whitespace-pre-line break-words">{profile.bio}</p>}
      </header>

      {isOwner ? (
        <Link href="/me/edit" className="btn self-start px-5 py-2 text-sm">
          Edit profile
        </Link>
      ) : (
        <FriendButton me={viewer.id} friendId={profile.id} handle={profile.handle} state={friendState!} />
      )}

      {profile.nowPlaying && <NowPlaying track={profile.nowPlaying} />}
      {profile.favorites.length > 0 && <Favorites favorites={profile.favorites} />}
      {profile.links.length > 0 && <Playlists links={profile.links} />}
      {profile.topTracks.length > 0 && <TopSongs tracks={profile.topTracks} />}
      {profile.topArtists.length > 0 && <TopArtists artists={profile.topArtists} />}

      {/* The owner always gets their own stats back, so tell them when nobody else does. */}
      {isOwner && !profile.showStats && (
        <p className="text-xs opacity-60">
          Your top songs and artists are hidden from others. <Link href="/me/edit" className="underline">Change this</Link>
        </p>
      )}

      {isEmpty &&
        (isOwner ? (
          <p className="text-sm opacity-60">
            Your profile is a blank page. <Link href="/me/edit" className="underline">Add a bio and the songs you have on repeat</Link>.
          </p>
        ) : (
          <p className="text-sm opacity-60">@{profile.handle} has not filled in their profile yet.</p>
        ))}
    </main>
  );
}

async function getFriendState(supabase: Awaited<ReturnType<typeof createClient>>, friendId: string): Promise<FriendState> {
  // my_friendships only ever contains rows the viewer is part of, so filtering by the other
  // person gives at most one row: the friendship between the two of us, if any.
  const { data } = await supabase.from("my_friendships").select("status, sent_by_me").eq("friend_id", friendId).maybeSingle();
  if (!data) return "none";
  if (data.status === "accepted") return "friends";
  return data.sent_by_me ? "requested" : "incoming";
}
