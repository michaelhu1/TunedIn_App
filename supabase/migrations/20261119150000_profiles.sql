-- Customizable profiles: display name, bio, class year, photo, favourite songs right now,
-- playlist links, and (optionally) top songs and artists.
--
-- Who can see a profile: signed-in members only (so, verified NYU addresses). Never the
-- open internet. What a profile shows is the owner's choice:
--   * Everything typed here (bio, favourites, links, photo) is public to members.
--   * Listening statistics appear only if `show_stats` is on, and never in ghost mode.
--   * Location is NOT part of a profile. It stays friends-only on the map.

-- ---------------------------------------------------------------------------
-- Profile fields
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column display_name text check (char_length(display_name) between 1 and 40),
  add column bio          text check (char_length(bio) <= 160),
  add column class_year   int  check (class_year between 2015 and 2040),
  -- Show my top songs and artists on my profile. On by default; one switch turns it off.
  add column show_stats   boolean not null default true;

-- The initial schema lets an owner update their whole row. Narrow that to the columns a
-- person may edit, so nothing else (id, created_at, university) can be rewritten.
revoke update on public.profiles from anon, authenticated;
grant update (handle, school_id, display_name, bio, class_year, avatar_url, show_stats)
  on public.profiles to authenticated;

-- Photos must live in our own storage bucket (see below), not at an arbitrary address.
-- A profile that pointed at someone else's server would let that server see who views it.
alter table public.profiles
  add constraint profiles_avatar_in_bucket
  check (avatar_url is null or avatar_url ~ '^https?://[^/]+/storage/v1/object/public/avatars/');

-- ---------------------------------------------------------------------------
-- Favourite songs right now: up to four, in an order the owner chooses
-- ---------------------------------------------------------------------------

create table public.profile_favorites (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  position smallint not null check (position between 1 and 4),
  track_id uuid not null references public.tracks (id),
  added_at timestamptz not null default now(),
  primary key (user_id, position),
  unique (user_id, track_id)
);

alter table public.profile_favorites enable row level security;
create policy "members can read favourites" on public.profile_favorites
  for select to authenticated using (true);
-- Removing one is safe to do directly. Adding goes through the server, which resolves the
-- song against the music catalogue first, exactly like a check-in.
create policy "remove own favourite" on public.profile_favorites
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.profile_favorites from anon;
revoke insert, update on public.profile_favorites from authenticated;

-- ---------------------------------------------------------------------------
-- Playlist links: up to three, only to known music services
-- ---------------------------------------------------------------------------

create table public.profile_links (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  title    text not null check (char_length(title) between 1 and 40),
  url      text not null check (
    char_length(url) <= 300
    and url ~ '^https://(open\.spotify\.com|music\.apple\.com|music\.youtube\.com|(www\.|m\.)?youtube\.com|youtu\.be|(on\.)?soundcloud\.com|(www\.)?deezer\.com|tidal\.com)/'
  ),
  primary key (user_id, position)
);

alter table public.profile_links enable row level security;
create policy "members can read links" on public.profile_links
  for select to authenticated using (true);
-- The check constraint above is the safety net, so owners may write these rows directly.
create policy "add own link" on public.profile_links
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "change own link" on public.profile_links
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "remove own link" on public.profile_links
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.profile_links from anon;

-- ---------------------------------------------------------------------------
-- Top songs and artists on a profile
-- ---------------------------------------------------------------------------
-- A person's plays are private (only they can read the rows). These two functions are the
-- only way anyone else sees anything derived from them, and they answer only when the
-- owner has `show_stats` on and ghost mode off. The owner always sees their own.
-- Counted over the last 90 days, by number of plays.

create function public.profile_stats_visible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
      or exists (
        select 1
        from public.profiles p
        join public.user_settings s on s.user_id = p.id
        where p.id = p_user_id and p.show_stats and not s.ghost_mode
      );
$$;

create function public.profile_top_tracks(p_user_id uuid, p_limit int default 5)
returns table (track_id uuid, title text, artist text, artwork_url text, plays int)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.title, t.artist, t.artwork_url, count(*)::int
  from public.plays pl
  join public.tracks t on t.id = pl.track_id
  where pl.user_id = p_user_id
    and pl.played_at > now() - interval '90 days'
    and public.profile_stats_visible(p_user_id)
  group by t.id
  order by count(*) desc, max(pl.played_at) desc
  limit greatest(1, least(p_limit, 10));
$$;

create function public.profile_top_artists(p_user_id uuid, p_limit int default 5)
returns table (artist text, artwork_url text, plays int)
language sql
stable
security definer
set search_path = ''
as $$
  select t.artist, (array_agg(t.artwork_url order by pl.played_at desc) filter (where t.artwork_url is not null))[1], count(*)::int
  from public.plays pl
  join public.tracks t on t.id = pl.track_id
  where pl.user_id = p_user_id
    and pl.played_at > now() - interval '90 days'
    and public.profile_stats_visible(p_user_id)
  group by t.artist
  order by count(*) desc, max(pl.played_at) desc
  limit greatest(1, least(p_limit, 10));
$$;

revoke execute on function public.profile_stats_visible, public.profile_top_tracks, public.profile_top_artists
  from public, anon;
grant execute on function public.profile_stats_visible, public.profile_top_tracks, public.profile_top_artists
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Profile photos: a storage bucket where each person can only write their own folder
-- ---------------------------------------------------------------------------
-- Files are stored as avatars/<user id>/<anything>. The app shrinks a photo to a small
-- square JPEG on the phone before uploading, which also strips the location and camera
-- details that phones embed in pictures. The bucket itself refuses anything over 512 KB
-- or that is not an image.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "upload own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "replace own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Postgres only lets UPDATE and DELETE touch rows the user can also SELECT, so without
-- this the two policies above would silently match nothing and old photos would pile up.
-- (Viewing a photo by its public URL does not go through this policy.)
create policy "see own avatar files" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
