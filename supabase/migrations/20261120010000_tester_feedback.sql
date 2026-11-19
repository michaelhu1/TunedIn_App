-- Changes from tester feedback.

-- 1. Up to five genre tags on a profile (was three). Same list of allowed genres.
alter table public.profiles drop constraint profiles_genres_check;
alter table public.profiles add constraint profiles_genres_check check (
  cardinality(genres) <= 5
  and genres <@ array['pop', 'hip-hop', 'r&b', 'indie', 'rock', 'alternative', 'electronic', 'house', 'techno', 'k-pop', 'j-pop', 'c-pop', 'latin', 'reggaeton', 'afrobeats', 'dancehall', 'bollywood', 'jazz', 'soul', 'classical', 'country', 'folk', 'metal', 'punk', 'emo', 'lo-fi', 'ambient', 'musical theatre']::text[]
);

-- 2. A picture for each playlist link.
-- The picture's address is looked up by the server from the music service itself (never
-- typed by a person), and it must be on one of those services' own image hosts. That keeps
-- a profile from embedding an image hosted somewhere that could track who views it.
alter table public.profile_links
  add column image_url text check (
    image_url is null
    or image_url ~ '^https://(i\.scdn\.co|mosaic\.scdn\.co|image-cdn-[a-z0-9-]+\.spotifycdn\.com|i\.ytimg\.com|i1\.sndcdn\.com|is[0-9]-ssl\.mzstatic\.com|[a-z0-9-]+\.dzcdn\.net)/'
  );
-- Members may still add and rename their own links, but only the server sets the picture.
revoke insert, update on public.profile_links from authenticated;
grant insert (user_id, position, title, url) on public.profile_links to authenticated;
grant update (title, url) on public.profile_links to authenticated;

-- 3. Animated GIFs as profile pictures. A GIF cannot be shrunk on the phone without losing
-- its animation, so it is uploaded as it is, and the size limit goes up to 2 MB to fit one.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    file_size_limit = 2097152
where id = 'avatars';

-- 4. Friends leaderboard: who among you and your friends listened most this week.
-- `plays` is every play; `songs` is how many different songs. Same circle as the friends
-- chart: you, plus accepted friends who show their stats and are not in ghost mode.
create function public.chart_friends_top_listeners(p_days int default 7, p_limit int default 25)
returns table (rank int, handle text, display_name text, avatar_url text, plays int, songs int, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with circle as (
    select p.id, p.handle, p.display_name, p.avatar_url
    from public.profiles p
    where p.id = (select auth.uid())
    union
    select p.id, p.handle, p.display_name, p.avatar_url
    from public.friendships f
    join public.profiles p
      on p.id = case when f.requester_id = (select auth.uid()) then f.addressee_id else f.requester_id end
    join public.user_settings s on s.user_id = p.id
    where f.status = 'accepted'
      and (select auth.uid()) in (f.requester_id, f.addressee_id)
      and p.show_stats
      and not s.ghost_mode
  ),
  totals as (
    select c.id, count(pl.id)::int as plays, count(distinct pl.track_id)::int as songs
    from circle c
    left join public.plays pl
      on pl.user_id = c.id
     and public.listening_day(pl.played_at) > public.listening_day(now()) - greatest(1, least(p_days, 31))
    group by c.id
  )
  select (row_number() over (order by t.plays desc, t.songs desc, c.handle))::int,
         c.handle, c.display_name, c.avatar_url, t.plays, t.songs, c.id = (select auth.uid())
  from circle c join totals t on t.id = c.id
  order by 1
  limit greatest(1, least(p_limit, 100));
$$;
revoke execute on function public.chart_friends_top_listeners from public, anon;
grant execute on function public.chart_friends_top_listeners to authenticated;
