import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getFullProfile } from "@/lib/profile";
import { emojiForMajor, flagForHometown } from "@/lib/profile-emoji";
import { STUDENT_STATUS } from "@/lib/profile-options";
import { createClient } from "@/lib/supabase/server";
import Avatar from "@/components/avatar";
import ShareButton from "@/components/share-button";
import FriendButton, { type FriendState } from "./friend-button";
import SafetyMenu from "./safety-menu";
import { labelFor } from "./labels";
import {
  Concerts,
  Favorites,
  InstagramButton,
  MakesMusicLine,
  MatchBadge,
  NowPlayingLine,
  Playlists,
  Prompt,
  TasteMatchCard,
  FavoriteArtists,
  TasteTags,
  TopArtists,
  TopSongs,
} from "./sections";


// A member's profile. The same screen serves two places: /u/<handle> for looking at someone
// else, and the Me tab for your own profile, where the friend button is replaced by Edit and
// Share and `ownListening` (your private listening stats) replaces the public top lists.
// What appears is decided by the database: getFullProfile runs as the viewer, so hidden
// stats come back empty and "now playing" only arrives for the owner or a friend.
export default async function ProfileScreen({
  viewerId,
  handle,
  ownListening,
}: {
  viewerId: string;
  handle: string;
  ownListening?: ReactNode;
}) {
  const supabase = await createClient();
  const profile = await getFullProfile(supabase, handle);
  if (!profile) notFound();

  const isOwner = profile.id === viewerId;
  // One extra query either way: friendship for a visitor, ghost mode for the owner.
  const [friendState, ghostMode, { data: mine }] = await Promise.all([
    isOwner ? null : getFriendState(supabase, profile.id),
    isOwner ? getOwnGhostMode(supabase, viewerId) : false,
    supabase.from("profiles").select("favorite_artists").eq("id", viewerId).maybeSingle(),
  ]);
  // Favourite artists the viewer and this person both picked: a ready-made thing to talk about.
  const myArtists = new Set(((mine?.favorite_artists ?? []) as string[]).map((a) => a.toLowerCase()));
  const sharedArtists = isOwner ? [] : profile.favoriteArtists.filter((a) => myArtists.has(a.toLowerCase()));

  const hasStats = profile.topTracks.length > 0 || profile.topArtists.length > 0;
  // Raw fields on purpose: if any of these is set, the person has started their profile,
  // even when a section later decides it has nothing it can show.
  const isEmpty =
    !profile.bio &&
    profile.favorites.length === 0 &&
    profile.links.length === 0 &&
    !hasStats &&
    !profile.pronouns &&
    !profile.major &&
    !profile.hometown &&
    !profile.instagram &&
    !profile.studentStatus &&
    !profile.prompt &&
    profile.favoriteArtists.length === 0 &&
    profile.genres.length === 0 &&
    profile.openTo.length === 0 &&
    profile.musicRoles.length === 0 &&
    !profile.musicNote &&
    profile.concerts.length === 0;
  const name = profile.displayName ?? `@${profile.handle}`;
  const status = labelFor(profile.studentStatus, STUDENT_STATUS);
  // "💻 Major · 🇺🇸 Hometown", or just one of them. The emoji and flag are guessed from the
  // text and left out when nothing matches.
  const majorEmoji = emojiForMajor(profile.major);
  const hometownFlag = flagForHometown(profile.hometown);
  const aboutLine = [
    profile.major && (majorEmoji ? `${majorEmoji} ${profile.major}` : profile.major),
    profile.hometown && (hometownFlag ? `${hometownFlag} ${profile.hometown}` : profile.hometown),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        {isOwner && (
          <div className="-mb-1 flex justify-end">
            <Link href="/settings" aria-label="Settings" className="rounded-full border border-foreground/20 p-2 hover:bg-foreground/5">
              <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
          </div>
        )}
        <div className="flex items-center gap-4">
          <Avatar handle={profile.handle} src={profile.avatarUrl} size={88} />
          <div className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-2">
              <h1 className="truncate text-2xl font-bold">{name}</h1>
              {/* Outside the <h1> so a long name truncates without hiding the pronouns. */}
              {profile.pronouns && <span className="shrink-0 text-sm opacity-60">{profile.pronouns}</span>}
            </div>
            {/* Without a display name the heading already is the handle, so do not repeat it. */}
            {profile.displayName && <p className="truncate opacity-60">@{profile.handle}</p>}
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="opacity-70">
                {profile.school.name}
                {profile.classYear && <> · Class of {profile.classYear}</>}
              </span>
              {status && <span className="rounded-full border border-foreground/20 px-2 py-0.5 text-xs">{status}</span>}
              {profile.tasteMatch && <MatchBadge score={profile.tasteMatch.score} />}
            </p>
            {aboutLine && <p className="break-words text-sm opacity-70">{aboutLine}</p>}
            <MakesMusicLine roles={profile.musicRoles} note={profile.musicNote} />
          </div>
        </div>
        {profile.nowPlaying && <NowPlayingLine track={profile.nowPlaying} />}
        {/* Plain text only; whitespace-pre-line keeps the owner's line breaks. */}
        {profile.bio && <p className="whitespace-pre-line break-words">{profile.bio}</p>}
        {/* Who they are, in one read: genres and what they are open to, before any buttons. */}
        <TasteTags genres={profile.genres} openTo={profile.openTo} />
      </header>

      {/* One row of actions: Edit and Share on your own profile, the friend button on anyone
          else's, with Instagram as a small button at the end. */}
      <div className="flex items-start gap-2">
        {isOwner ? (
          <>
            <Link href="/me/edit" className="flex h-10 flex-1 items-center justify-center rounded-lg border border-foreground/20 text-sm font-semibold hover:bg-foreground/5">
              Edit profile
            </Link>
            <ShareButton
              path={`/invite/${profile.handle}`}
              title={`Add @${profile.handle} on TunedIn`}
              label="Share profile"
              className="h-10 flex-1 rounded-lg border border-foreground/20 text-center text-sm font-semibold hover:bg-foreground/5"
            />
          </>
        ) : (
          <div className="min-w-0 flex-1">
            <FriendButton me={viewerId} friendId={profile.id} handle={profile.handle} state={friendState ?? "none"} />
          </div>
        )}
        <InstagramButton handle={profile.instagram} />
      </div>

      {/* Pictures before words: the cover-art sections come first. */}
      {profile.favorites.length > 0 && <Favorites favorites={profile.favorites} />}
      {profile.links.length > 0 && <Playlists links={profile.links} />}
      {profile.prompt && <Prompt prompt={profile.prompt} />}
      {/* The match number is a badge by the name; this card is the explanation of it. */}
      {profile.tasteMatch && <TasteMatchCard match={profile.tasteMatch} />}
      <FavoriteArtists artists={profile.favoriteArtists} sharedWithViewer={sharedArtists} />
      <Concerts concerts={profile.concerts} isOwner={isOwner} />
      {ownListening ?? (
        <>
          {profile.topTracks.length > 0 && <TopSongs tracks={profile.topTracks} />}
          {profile.topArtists.length > 0 && <TopArtists artists={profile.topArtists} />}
        </>
      )}

      {/* The owner always gets their own stats back, so tell them when nobody else does.
          Ghost mode and "show stats" are separate switches, so each gets its own note. */}
      {isOwner && ghostMode && (
        <p className="text-xs opacity-60">
          You are in ghost mode, so your top songs and artists are hidden from others. <Link href="/settings" className="underline">Change this</Link>
        </p>
      )}
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
      {/* Block and report sit at the very bottom: easy to find, hard to hit by accident. */}
      {!isOwner && <SafetyMenu me={viewerId} userId={profile.id} handle={profile.handle} />}
    </main>
  );
}

// Ghost mode lives in user_settings, not on the profile. Row-level security lets you read
// only your own settings row, which is why this runs on the owner's own profile only.
async function getOwnGhostMode(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<boolean> {
  const { data } = await supabase.from("user_settings").select("ghost_mode").eq("user_id", userId).maybeSingle();
  return data?.ghost_mode ?? false;
}

async function getFriendState(supabase: Awaited<ReturnType<typeof createClient>>, friendId: string): Promise<FriendState> {
  // my_friendships only ever contains rows the viewer is part of, so filtering by the other
  // person gives at most one row: the friendship between the two of us, if any.
  const { data } = await supabase.from("my_friendships").select("status, sent_by_me").eq("friend_id", friendId).maybeSingle();
  if (!data) return "none";
  if (data.status === "accepted") return "friends";
  return data.sent_by_me ? "requested" : "incoming";
}
