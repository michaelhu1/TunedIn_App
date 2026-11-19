-- One definition of a day, everywhere.
--
-- A tester saw "8 days" under "This week" in their own stats: the app had looked back
-- 7 x 24 hours, which touches eight calendar days. That was fixed in the app. A review then
-- found the same family of mistake in two database functions, fixed here:
--
--   * admin_stats: "active today" meant the last 24 hours, "this week" the last 7 x 24
--     hours, and the daily series split days at midnight. They now use the app's listening
--     day (4am to 4am in New York), so "this week" is today and the six days before it and
--     matches the charts.
--   * people_you_might_click_with: "going to the same concert" compared concert dates with
--     the database server's date, which is UTC. From 7pm New York time, tonight's concert
--     was treated as already over. It now uses the New York date.

create or replace function public.admin_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select generate_series(
      (public.listening_day(now()) - 29),
      public.listening_day(now()),
      interval '1 day')::date as day
  ),
  signups as (
    select public.listening_day(created_at) as day, count(*)::int as n
    from public.profiles group by 1
  ),
  plays_by_day as (
    select public.listening_day(played_at) as day,
           count(*)::int as plays, count(distinct user_id)::int as listeners
    from public.plays
    where played_at > now() - interval '32 days'
    group by 1
  ),
  friends_by_day as (
    select public.listening_day(accepted_at) as day, count(*)::int as n
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
      'today',      (select count(*) from public.user_settings where public.listening_day(last_active_at) = public.listening_day(now())),
      'this_week',  (select count(*) from public.user_settings where public.listening_day(last_active_at) > public.listening_day(now()) - 7),
      'this_month', (select count(*) from public.user_settings where public.listening_day(last_active_at) > public.listening_day(now()) - 30),
      'listeners_this_week', (select count(distinct user_id) from public.plays where played_at > now() - interval '8 days' and public.listening_day(played_at) > public.listening_day(now()) - 7)
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
                                  where public.listening_day(p.created_at) <= d.day),
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


-- The discover function is long and only one expression in it is wrong, so it is patched in
-- place: read its current definition, swap the server's date for the New York date, and
-- store it again. Grants are kept, because this replaces the same function.
do $$
declare
  def text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'people_you_might_click_with';
  if def is null or position('current_date' in def) = 0 then
    raise exception 'people_you_might_click_with does not look the way this migration expects';
  end if;
  execute replace(def, 'current_date', '((now() at time zone ''America/New_York'')::date)');
end;
$$;
