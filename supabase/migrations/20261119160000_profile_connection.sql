-- Profile fields for connecting with people: a prompt, genre tags, what you are open to,
-- major, hometown, pronouns, Instagram, how you make music, a first-year / transfer badge,
-- concerts, and a taste match between two members.
--
-- Everything is optional. Choices come from fixed lists (kept in step with
-- app/src/lib/profile-options.ts) so profiles can be compared and there is less free text
-- to moderate. Like the rest of a profile, this is visible to signed-in members only.

alter table public.profiles
  add column pronouns       text check (char_length(pronouns) between 1 and 20),
  add column major          text check (char_length(major) between 1 and 60),
  add column hometown       text check (char_length(hometown) between 1 and 60),
  -- The handle only, never a link: lowercase, no "@". The app builds the instagram.com URL.
  add column instagram      text check (instagram ~ '^[a-z0-9._]{1,30}$'),
  add column student_status text check (student_status in ('first_year', 'transfer')),
  add column prompt_key     text check (prompt_key in ('finals_song', 'no_skips', 'aux', 'first_concert', 'hot_take', 'always_gets_me', 'nyc_song', 'ask_me')),
  add column prompt_answer  text check (char_length(prompt_answer) between 1 and 120),
  add column genres         text[] not null default '{}' check (
    cardinality(genres) <= 3
    and genres <@ array['pop', 'hip-hop', 'r&b', 'indie', 'rock', 'alternative', 'electronic', 'house', 'techno', 'k-pop', 'j-pop', 'c-pop', 'latin', 'reggaeton', 'afrobeats', 'dancehall', 'bollywood', 'jazz', 'soul', 'classical', 'country', 'folk', 'metal', 'punk', 'emo', 'lo-fi', 'ambient', 'musical theatre']::text[]
  ),
  add column open_to        text[] not null default '{}' check (
    open_to <@ array['concert_buddies', 'playlist_swaps', 'recommendations', 'jamming', 'study_playlists', 'new_friends']::text[]
  ),
  add column music_roles    text[] not null default '{}' check (
    music_roles <@ array['sing', 'guitar', 'bass', 'drums', 'keys', 'strings', 'horns', 'produce', 'dj', 'songwriting', 'band', 'radio']::text[]
  ),
  add column music_note     text check (char_length(music_note) between 1 and 60),
  -- A prompt and its answer only make sense together.
  add constraint profiles_prompt_pair check ((prompt_key is null) = (prompt_answer is null));

grant update (pronouns, major, hometown, instagram, student_status, prompt_key, prompt_answer,
              genres, open_to, music_roles, music_note)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Concerts: shows you went to and shows you are going to (up to six)
-- ---------------------------------------------------------------------------

create table public.profile_concerts (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  position   smallint not null check (position between 1 and 6),
  status     text not null check (status in ('going', 'went')),
  artist     text not null check (char_length(artist) between 1 and 80),
  venue      text check (char_length(venue) between 1 and 80),
  event_date date check (event_date between date '1990-01-01' and date '2040-12-31'),
  primary key (user_id, position)
);

alter table public.profile_concerts enable row level security;
create policy "members can read concerts" on public.profile_concerts
  for select to authenticated using (true);
create policy "add own concert" on public.profile_concerts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "change own concert" on public.profile_concerts
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "remove own concert" on public.profile_concerts
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.profile_concerts from anon;

-- ---------------------------------------------------------------------------
-- Taste match: how much my listening overlaps with someone else's
-- ---------------------------------------------------------------------------
-- "You and Maya: 72% match. You both play SZA, Frank Ocean and Tyler, The Creator."
--
-- How it is worked out, over each person's last 90 days:
--   1. Count plays per artist for both people.
--   2. Dampen the counts with a logarithm, so playing an artist 200 times does not drown
--      out everything else in someone's taste.
--   3. Compare the two lists with cosine similarity: 0 when they share no artists, 100
--      when they listen to the same artists in the same proportions.
-- The shared artists listed are the ones both people play most.
--
-- Privacy: this is derived from the other person's plays, so it answers only when they
-- allow their stats to be shown (same rule as top songs: `show_stats` on, ghost mode off),
-- and it always compares against the CALLER. Nobody can ask how two other people match.
-- It returns no row when either person has too little listening to say anything.

create function public.taste_match(p_other uuid)
returns table (score int, shared_artists text[], shared_count int)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select t.artist, ln(1 + count(*))::float8 as w
    from public.plays pl join public.tracks t on t.id = pl.track_id
    where pl.user_id = (select auth.uid()) and pl.played_at > now() - interval '90 days'
    group by t.artist
  ),
  them as (
    select t.artist, ln(1 + count(*))::float8 as w
    from public.plays pl join public.tracks t on t.id = pl.track_id
    where pl.user_id = p_other and pl.played_at > now() - interval '90 days'
    group by t.artist
  ),
  shared as (
    select me.artist, me.w * them.w as product, least(me.w, them.w) as strength
    from me join them using (artist)
  )
  select
    round(100 * coalesce((select sum(product) from shared), 0)
          / (sqrt((select sum(w * w) from me)) * sqrt((select sum(w * w) from them))))::int,
    coalesce((select array_agg(artist order by strength desc, artist) from
               (select artist, strength from shared order by strength desc, artist limit 3) top), '{}'),
    (select count(*)::int from shared)
  where (select auth.uid()) is not null
    and p_other <> (select auth.uid())
    and public.profile_stats_visible(p_other)
    -- Need at least three artists each before a percentage means anything.
    and (select count(*) from me) >= 3
    and (select count(*) from them) >= 3;
$$;

revoke execute on function public.taste_match from public, anon;
grant execute on function public.taste_match to authenticated;
