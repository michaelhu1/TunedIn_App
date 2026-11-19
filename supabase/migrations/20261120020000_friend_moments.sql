-- Friends, made smarter: "moments" on Home and a one-tap way to respond.
--
-- Until now Home listed one row per friend. The idea here is to show a few things worth
-- noticing about a friend, and to let you answer them:
--   * "You and Maya both had Nights on today"   (friend_same_songs_today)
--   * friends ordered by how much your listening overlaps (friend_overlap), used only to
--     sort your own screen and never shown to anyone
--   * "felt this": one tap on a friend's song, seen only by that friend (song_reactions)
--
-- Privacy notes
--   * friend_same_songs_today only ever reveals a song that YOU also played today, and only
--     for accepted friends who are not in ghost mode and who let their stats be seen (the
--     same rule as the friends charts). friend_overlap follows the same rule.
--   * Nothing here announces absence ("has not listened in a while") or reads meaning into
--     what someone plays.

-- ---------------------------------------------------------------------------
-- Songs a friend and I both played in the current listening day
-- ---------------------------------------------------------------------------
create function public.friend_same_songs_today()
returns table (friend_id uuid, track_id uuid, title text, artist text, artwork_url text)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id),
  friends as (
    select p.id
    from public.friendships f
    join me on me.id in (f.requester_id, f.addressee_id)
    join public.profiles p
      on p.id = case when f.requester_id = me.id then f.addressee_id else f.requester_id end
    -- The same circle as the friends charts: a friend who hides their stats, or is in
    -- ghost mode, is left out entirely.
    where f.status = 'accepted' and p.show_stats and not public.is_ghost(p.id)
  ),
  mine as (
    select distinct pl.track_id from public.plays pl, me
    where pl.user_id = me.id
      and pl.played_at > now() - interval '24 hours'  -- lets the index narrow it to recent plays
      and public.listening_day(pl.played_at) = public.listening_day(now())
  )
  select distinct fr.id, t.id, t.title, t.artist, t.artwork_url
  from friends fr
  join public.plays pl on pl.user_id = fr.id and pl.played_at > now() - interval '24 hours'
  join mine on mine.track_id = pl.track_id
  join public.tracks t on t.id = pl.track_id
  where public.listening_day(pl.played_at) = public.listening_day(now());
$$;
revoke execute on function public.friend_same_songs_today from public, anon;
grant execute on function public.friend_same_songs_today to authenticated;

-- ---------------------------------------------------------------------------
-- How much each friend's recent listening overlaps with mine
-- ---------------------------------------------------------------------------
-- The number of artists we both played in the last 30 days. It is a sorting key for my own
-- Home screen: the app never displays it, and no one can see where they rank on someone
-- else's screen. (You could read your own numbers by calling this directly, which is why
-- friends who hide their stats are left out.)
create function public.friend_overlap()
returns table (friend_id uuid, shared_artists int)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id),
  friends as (
    select p.id
    from public.friendships f
    join me on me.id in (f.requester_id, f.addressee_id)
    join public.profiles p
      on p.id = case when f.requester_id = me.id then f.addressee_id else f.requester_id end
    -- The same circle as the friends charts: a friend who hides their stats, or is in
    -- ghost mode, is left out entirely.
    where f.status = 'accepted' and p.show_stats and not public.is_ghost(p.id)
  ),
  mine as (
    select distinct lower(t.artist) as artist
    from public.plays pl join public.tracks t on t.id = pl.track_id, me
    where pl.user_id = me.id and pl.played_at > now() - interval '30 days'
  )
  select fr.id, count(distinct lower(t.artist))::int
  from friends fr
  join public.plays pl on pl.user_id = fr.id and pl.played_at > now() - interval '30 days'
  join public.tracks t on t.id = pl.track_id
  join mine on mine.artist = lower(t.artist)
  group by fr.id;
$$;
revoke execute on function public.friend_overlap from public, anon;
grant execute on function public.friend_overlap to authenticated;

-- ---------------------------------------------------------------------------
-- "Felt this": a one-tap response to a friend's song
-- ---------------------------------------------------------------------------
-- One row = "sender felt receiver's song on that day". Only the two people involved can
-- ever read it. There are no counts, no public display and no read receipts. Rows are
-- written only through felt_this() below, which checks that the two are friends and that
-- the song really is what the friend is showing today, so nobody can react to a song they
-- cannot see.
create table public.song_reactions (
  sender_id   uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  track_id    uuid not null references public.tracks (id),
  day         date not null,
  created_at  timestamptz not null default now(),
  primary key (sender_id, receiver_id, track_id, day),
  check (sender_id <> receiver_id)
);
create index song_reactions_receiver_idx on public.song_reactions (receiver_id, created_at desc);

alter table public.song_reactions enable row level security;
create policy "read reactions I sent or received" on public.song_reactions
  for select to authenticated
  using ((select auth.uid()) in (sender_id, receiver_id) and not public.blocked_between(sender_id, receiver_id));
create policy "take back my reaction" on public.song_reactions
  for delete to authenticated using (sender_id = (select auth.uid()));
revoke all on public.song_reactions from anon;
revoke insert, update, truncate, references, trigger on public.song_reactions from authenticated;

create function public.felt_this(p_friend uuid, p_track uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or p_friend is null or p_friend = me then return false; end if;
  -- Ghost mode works both ways: you cannot be reacted to, and you cannot react (it would
  -- tell the friend you are around).
  if not public.are_friends(me, p_friend) or public.is_ghost(p_friend) or public.is_ghost(me) then return false; end if;
  -- Only the song the friend is showing today can be reacted to.
  if not exists (
    select 1 from public.presence pr
    where pr.user_id = p_friend and pr.track_id = p_track and pr.expires_at > now()
  ) then
    return false;
  end if;
  insert into public.song_reactions (sender_id, receiver_id, track_id, day)
  values (me, p_friend, p_track, public.listening_day(now()))
  on conflict do nothing;
  return true;
end;
$$;
revoke execute on function public.felt_this from public, anon;
grant execute on function public.felt_this to authenticated;

-- When a friendship ends (removed, or ended by a block), the reactions between the two go
-- with it, so nothing is left to read and nothing comes back if they become friends again.
create function public.friendship_end_clears_reactions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.song_reactions r
  where (r.sender_id = old.requester_id and r.receiver_id = old.addressee_id)
     or (r.sender_id = old.addressee_id and r.receiver_id = old.requester_id);
  return old;
end;
$$;
revoke execute on function public.friendship_end_clears_reactions from public, anon, authenticated;
create trigger friendship_end_clears_reactions
  after delete on public.friendships
  for each row execute function public.friendship_end_clears_reactions();

-- ---------------------------------------------------------------------------
-- Playlist pictures follow the link
-- ---------------------------------------------------------------------------
-- A member can change a playlist link's address but not its picture (the server fetches
-- that). If the address changes, the old picture no longer belongs to it, so clear it.
create function public.profile_link_url_change_clears_image()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.url is distinct from old.url and new.image_url is not distinct from old.image_url then
    new.image_url := null;
  end if;
  return new;
end;
$$;
create trigger profile_link_url_change_clears_image
  before update on public.profile_links
  for each row execute function public.profile_link_url_change_clears_image();
