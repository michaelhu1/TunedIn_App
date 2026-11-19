-- Numbers for the person running TunedIn: sign-ups, activity, friendships and plays.
--
-- Totals only, never anything about an individual. The function can be called only with the
-- server's own key (service role), and the app only does that for people listed in the
-- ADMIN_EMAILS setting (see app/src/app/admin/stats/page.tsx). Members cannot call it.
--
-- "Active" here means opened the app: `last_active_at` is updated when someone opens Home
-- or the Map. Days are New York days.

create function public.admin_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select generate_series(
      ((now() at time zone 'America/New_York')::date - 29),
      (now() at time zone 'America/New_York')::date,
      interval '1 day')::date as day
  ),
  signups as (
    select (created_at at time zone 'America/New_York')::date as day, count(*)::int as n
    from public.profiles group by 1
  ),
  plays_by_day as (
    select (played_at at time zone 'America/New_York')::date as day,
           count(*)::int as plays, count(distinct user_id)::int as listeners
    from public.plays
    where played_at > now() - interval '31 days'
    group by 1
  ),
  friends_by_day as (
    select (accepted_at at time zone 'America/New_York')::date as day, count(*)::int as n
    from public.friendships where status = 'accepted' and accepted_at is not null group by 1
  )
  select jsonb_build_object(
    'generated_at', now(),
    'totals', jsonb_build_object(
      'signups',             (select count(*) from public.profiles),
      'connected_music',     (select count(*) from public.user_settings where lastfm_username is not null),
      'sharing_location',    (select count(*) from public.user_settings where share_location and not ghost_mode),
      'with_photo',          (select count(*) from public.profiles where avatar_url is not null),
      'friendships',         (select count(*) from public.friendships where status = 'accepted'),
      'pending_requests',    (select count(*) from public.friendships where status = 'pending'),
      'plays',               (select count(*) from public.plays),
      'plays_streamed',      (select count(*) from public.plays where source = 'lastfm'),
      'plays_set_by_hand',   (select count(*) from public.plays where source = 'checkin'),
      'songs',               (select count(*) from public.tracks),
      'open_reports',        (select count(*) from public.reports where status = 'open')
    ),
    'active', jsonb_build_object(
      'today',      (select count(*) from public.user_settings where last_active_at > now() - interval '24 hours'),
      'this_week',  (select count(*) from public.user_settings where last_active_at > now() - interval '7 days'),
      'this_month', (select count(*) from public.user_settings where last_active_at > now() - interval '30 days'),
      'listeners_this_week', (select count(distinct user_id) from public.plays where played_at > now() - interval '7 days')
    ),
    'schools', (
      select coalesce(jsonb_agg(jsonb_build_object('school', x.short_name, 'members', x.members) order by x.members desc), '[]'::jsonb)
      from (select s.short_name, count(*)::int as members
              from public.profiles p join public.schools s on s.id = p.school_id group by s.short_name) x
    ),
    'daily', (
      select jsonb_agg(jsonb_build_object(
               'day', d.day,
               'signups', coalesce(su.n, 0),
               'total_signups', (select count(*) from public.profiles p
                                  where (p.created_at at time zone 'America/New_York')::date <= d.day),
               'plays', coalesce(pl.plays, 0),
               'listeners', coalesce(pl.listeners, 0),
               'friendships', coalesce(fr.n, 0)) order by d.day)
      from days d
      left join signups su on su.day = d.day
      left join plays_by_day pl on pl.day = d.day
      left join friends_by_day fr on fr.day = d.day
    )
  );
$$;

revoke execute on function public.admin_stats from public, anon, authenticated;
grant execute on function public.admin_stats to service_role;
