-- All-day status + charts.
--
-- Two ideas drive everything in this file:
--
-- 1. The "listening day". A day on TunedIn runs from 4am to 4am New York time, so a song
--    checked in at 1am still belongs to the night before. Your current song stays up until
--    the listening day ends; the app shows it as "live" for the first 30 minutes and as
--    "earlier today" after that.
--
-- 2. Charts count listeners, not plays. One person counts ONCE per song per listening day,
--    whether they tapped it once or their Last.fm logged it forty times. A song climbs only
--    when many different people play it. There is no cap on how many songs a person can
--    contribute to.

-- ---------------------------------------------------------------------------
-- Listening day helpers
-- ---------------------------------------------------------------------------

create function public.listening_day(ts timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select ((ts at time zone 'America/New_York') - interval '4 hours')::date;
$$;

create function public.listening_day_end(ts timestamptz default now())
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((public.listening_day(ts) + 1)::timestamp + interval '4 hours') at time zone 'America/New_York';
$$;

-- Chart queries filter by time window and group by (user, track, day).
create index plays_track_idx on public.plays (track_id);

-- ---------------------------------------------------------------------------
-- Small settings table, editable from the Supabase dashboard
-- ---------------------------------------------------------------------------

create table public.app_settings (
  key   text primary key,
  value jsonb not null,
  note  text
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;  -- server and dashboard only

insert into public.app_settings (key, value, note) values
  ('chart_min_listeners', '5',
   'A chart (NYU or one school) only appears once this many different people have plays in the window, so a chart can never describe just one or two people. Lower it to 1 while testing alone.');

create function public.chart_min_listeners()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::int from public.app_settings where key = 'chart_min_listeners'), 5);
$$;

-- ---------------------------------------------------------------------------
-- Check-in: one play + your status for the rest of the listening day, in one transaction
-- ---------------------------------------------------------------------------

create function public.record_checkin(p_user_id uuid, p_track_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.plays (user_id, track_id, played_at, source)
  values (p_user_id, p_track_id, now(), 'checkin');

  -- Only the song and timestamps change, so an existing location cell is kept.
  insert into public.presence (user_id, track_id, updated_at, expires_at)
  values (p_user_id, p_track_id, now(), public.listening_day_end())
  on conflict (user_id) do update set
    track_id   = excluded.track_id,
    updated_at = excluded.updated_at,
    expires_at = excluded.expires_at;
end;
$$;
revoke execute on function public.record_checkin from public, anon, authenticated;
grant execute on function public.record_checkin to service_role;

-- ---------------------------------------------------------------------------
-- Chart building block: one row per (listener, song, listening day) in a scope
-- ---------------------------------------------------------------------------
-- Not callable by clients. The public chart functions below are the only way in, and they
-- return aggregates only.

create function public.chart_listens(p_school_slug text, p_days int)
returns table (user_id uuid, track_id uuid, day date)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct pl.user_id, pl.track_id, public.listening_day(pl.played_at)
  from public.plays pl
  join public.profiles pr on pr.id = pl.user_id
  join public.schools s on s.id = pr.school_id
  where public.listening_day(pl.played_at) > public.listening_day(now()) - greatest(1, least(p_days, 31))
    and (p_school_slug is null or s.slug = p_school_slug);
$$;
revoke execute on function public.chart_listens from public, anon, authenticated;

-- How many different people are in a scope's window, and how many it needs to unlock.
create function public.chart_status(p_school_slug text default null, p_days int default 7)
returns table (listeners int, required int, unlocked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with n as (select count(distinct user_id)::int as c from public.chart_listens(p_school_slug, p_days))
  select n.c, public.chart_min_listeners(), n.c >= public.chart_min_listeners() from n;
$$;

-- Top songs, ranked by `listeners` (different people in the window). Ties are broken by
-- `points` = listener-days (one per person per song per day), so a song people came back
-- to on several days beats one they played once. Empty until the scope is unlocked.
create function public.chart_top_tracks(p_school_slug text default null, p_days int default 7, p_limit int default 25)
returns table (rank int, track_id uuid, title text, artist text, artwork_url text, listeners int, points int)
language sql
stable
security definer
set search_path = ''
as $$
  with l as (select * from public.chart_listens(p_school_slug, p_days)),
  agg as (
    select l.track_id, count(distinct l.user_id)::int as listeners, count(*)::int as points
    from l group by l.track_id
  )
  select (row_number() over (order by a.listeners desc, a.points desc, t.title))::int,
         t.id, t.title, t.artist, t.artwork_url, a.listeners, a.points
  from agg a join public.tracks t on t.id = a.track_id
  where (select unlocked from public.chart_status(p_school_slug, p_days))
  order by 1
  limit greatest(1, least(p_limit, 100));
$$;

-- Top artists. One point per person per artist per day.
create function public.chart_top_artists(p_school_slug text default null, p_days int default 7, p_limit int default 25)
returns table (rank int, artist text, artwork_url text, listeners int, points int)
language sql
stable
security definer
set search_path = ''
as $$
  with l as (
    select distinct l.user_id, l.day, t.artist
    from public.chart_listens(p_school_slug, p_days) l
    join public.tracks t on t.id = l.track_id
  ),
  agg as (
    select l.artist, count(distinct l.user_id)::int as listeners, count(*)::int as points
    from l group by l.artist
  )
  select (row_number() over (order by a.listeners desc, a.points desc, a.artist))::int,
         a.artist,
         (select t.artwork_url from public.tracks t
           where t.artist = a.artist and t.artwork_url is not null limit 1),
         a.listeners, a.points
  from agg a
  where (select unlocked from public.chart_status(p_school_slug, p_days))
  order by 1
  limit greatest(1, least(p_limit, 100));
$$;

-- School leaderboard. Ranked by points per member, so a big school does not win just by
-- being big. Schools under the listener minimum are listed but unranked ("needs 3 more").
create function public.chart_schools(p_days int default 7)
returns table (
  rank int, slug text, short_name text, name text,
  members int, listeners int, points int, points_per_member numeric,
  unlocked boolean, required int
)
language sql
stable
security definer
set search_path = ''
as $$
  with members as (
    select school_id, count(*)::int as members from public.profiles group by school_id
  ),
  activity as (
    select pr.school_id, count(distinct l.user_id)::int as listeners, count(*)::int as points
    from public.chart_listens(null, p_days) l
    join public.profiles pr on pr.id = l.user_id
    group by pr.school_id
  ),
  rows as (
    select s.slug, s.short_name, s.name, m.members,
           coalesce(a.listeners, 0) as listeners,
           coalesce(a.points, 0) as points,
           coalesce(a.listeners, 0) >= public.chart_min_listeners() as unlocked
    from public.schools s
    join members m on m.school_id = s.id
    left join activity a on a.school_id = s.id
  )
  select case when r.unlocked
              then (row_number() over (partition by r.unlocked order by r.points::numeric / r.members desc, r.points desc))::int
         end,
         r.slug, r.short_name, r.name, r.members, r.listeners,
         case when r.unlocked then r.points end,
         case when r.unlocked then round(r.points::numeric / r.members, 1) end,
         r.unlocked, public.chart_min_listeners()
  from rows r
  order by r.unlocked desc, 1 nulls last, r.listeners desc, r.name;
$$;

-- Top listeners: people ranked by how many different songs they logged (listener-days).
-- People in ghost mode are left out. `automatic` marks people whose plays come from
-- Last.fm, since logging everything automatically will always beat tapping by hand.
create function public.chart_top_listeners(p_school_slug text default null, p_days int default 7, p_limit int default 25)
returns table (rank int, handle text, school text, avatar_url text, points int, automatic boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with agg as (
    select l.user_id, count(*)::int as points
    from public.chart_listens(p_school_slug, p_days) l
    where not public.is_ghost(l.user_id)
    group by l.user_id
  )
  select (row_number() over (order by a.points desc, pr.handle))::int,
         pr.handle, s.short_name, pr.avatar_url, a.points,
         exists (
           select 1 from public.plays pl
           where pl.user_id = a.user_id and pl.source = 'lastfm'
             and public.listening_day(pl.played_at) > public.listening_day(now()) - greatest(1, least(p_days, 31))
         )
  from agg a
  join public.profiles pr on pr.id = a.user_id
  join public.schools s on s.id = pr.school_id
  where (select unlocked from public.chart_status(p_school_slug, p_days))
  order by 1
  limit greatest(1, least(p_limit, 100));
$$;

-- "You and 13 others at NYU played this today": the reward shown right after a check-in.
-- A bare count, so it is safe below the chart minimum.
create function public.track_listeners_today(p_track_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct pl.user_id)::int
  from public.plays pl
  where pl.track_id = p_track_id
    and public.listening_day(pl.played_at) = public.listening_day(now());
$$;

-- Charts are for signed-in members for now. Public share pages (build step 6) will read
-- them through the server.
revoke execute on function
  public.chart_status, public.chart_top_tracks, public.chart_top_artists,
  public.chart_schools, public.chart_top_listeners, public.track_listeners_today,
  public.chart_min_listeners
from public, anon;
grant execute on function
  public.chart_status, public.chart_top_tracks, public.chart_top_artists,
  public.chart_schools, public.chart_top_listeners, public.track_listeners_today
to authenticated, service_role;
