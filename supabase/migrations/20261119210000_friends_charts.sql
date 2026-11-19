-- A "Friends" category for charts: what you and your friends have been playing.
--
-- Who is included: you, plus accepted friends who are not in ghost mode and who let their
-- stats be seen. That last rule matters. With only one or two friends, a "friends chart" is
-- close to that friend's own top songs, so it must not show more than their profile already
-- does. A friend who hides their stats is simply left out.
--
-- Counting is the same as the campus charts: one point per person per song per day.
-- Because these are your friends, each row also says WHO played it (their handles), which
-- the campus charts never do.

create function public.chart_friends_listens(p_days int)
returns table (user_id uuid, handle text, track_id uuid, day date)
language sql
stable
security definer
set search_path = ''
as $$
  with circle as (
    select p.id, p.handle
    from public.profiles p
    where p.id = (select auth.uid())
    union
    select p.id, p.handle
    from public.friendships f
    join public.profiles p
      on p.id = case when f.requester_id = (select auth.uid()) then f.addressee_id else f.requester_id end
    join public.user_settings s on s.user_id = p.id
    where f.status = 'accepted'
      and (select auth.uid()) in (f.requester_id, f.addressee_id)
      and p.show_stats
      and not s.ghost_mode
  )
  select distinct c.id, c.handle, pl.track_id, public.listening_day(pl.played_at)
  from circle c
  join public.plays pl on pl.user_id = c.id
  where public.listening_day(pl.played_at) > public.listening_day(now()) - greatest(1, least(p_days, 31));
$$;
revoke execute on function public.chart_friends_listens from public, anon, authenticated;

create function public.chart_friends_top_tracks(p_days int default 7, p_limit int default 25)
returns table (rank int, track_id uuid, title text, artist text, artwork_url text, listeners int, points int, handles text[])
language sql
stable
security definer
set search_path = ''
as $$
  with agg as (
    select l.track_id,
           count(distinct l.user_id)::int as listeners,
           count(*)::int as points,
           array_agg(distinct l.handle) as handles
    from public.chart_friends_listens(p_days) l
    group by l.track_id
  )
  select (row_number() over (order by a.listeners desc, a.points desc, t.title))::int,
         t.id, t.title, t.artist, t.artwork_url, a.listeners, a.points, a.handles
  from agg a join public.tracks t on t.id = a.track_id
  order by 1
  limit greatest(1, least(p_limit, 100));
$$;

create function public.chart_friends_top_artists(p_days int default 7, p_limit int default 25)
returns table (rank int, artist text, artwork_url text, listeners int, points int, handles text[])
language sql
stable
security definer
set search_path = ''
as $$
  with l as (
    select distinct f.user_id, f.handle, f.day, t.artist
    from public.chart_friends_listens(p_days) f
    join public.tracks t on t.id = f.track_id
  ),
  agg as (
    select l.artist,
           count(distinct l.user_id)::int as listeners,
           count(*)::int as points,
           array_agg(distinct l.handle) as handles
    from l group by l.artist
  )
  select (row_number() over (order by a.listeners desc, a.points desc, a.artist))::int,
         a.artist,
         (select t.artwork_url from public.tracks t
           where t.artist = a.artist and t.artwork_url is not null limit 1),
         a.listeners, a.points, a.handles
  from agg a
  order by 1
  limit greatest(1, least(p_limit, 100));
$$;

revoke execute on function public.chart_friends_top_tracks, public.chart_friends_top_artists from public, anon;
grant execute on function public.chart_friends_top_tracks, public.chart_friends_top_artists to authenticated;
