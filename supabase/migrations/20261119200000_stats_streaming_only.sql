-- Stats count streaming plays only.
--
-- TunedIn is a social layer on top of the music people already stream. A play that arrived
-- from a streaming service (through Last.fm) is evidence someone listened. A song set by
-- hand inside TunedIn is a status: it shows on your profile, Home and the map as what you
-- are playing, but it is self-reported, so it no longer counts toward any statistic.
--
-- This redefines the functions that add up plays so they read only `source = 'lastfm'`:
--   charts (songs, artists, schools, top listeners) through chart_listens,
--   top songs and artists on profiles, taste match, and "people you might click with".
-- Nothing is deleted: hand-set songs are still stored in `plays` with source 'checkin',
-- so this is one line per function to reverse.
--
-- The function bodies below are otherwise unchanged from the earlier migrations.

CREATE OR REPLACE FUNCTION public.chart_listens(p_school_slug text, p_days integer)
 RETURNS TABLE(user_id uuid, track_id uuid, day date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select distinct pl.user_id, pl.track_id, public.listening_day(pl.played_at)
  from public.plays pl
  join public.profiles pr on pr.id = pl.user_id
  join public.schools s on s.id = pr.school_id
  where pl.source = 'lastfm'
    and public.listening_day(pl.played_at) > public.listening_day(now()) - greatest(1, least(p_days, 31))
    and (p_school_slug is null or s.slug = p_school_slug);
$function$;

CREATE OR REPLACE FUNCTION public.profile_top_tracks(p_user_id uuid, p_limit integer DEFAULT 5)
 RETURNS TABLE(track_id uuid, title text, artist text, artwork_url text, plays integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select t.id, t.title, t.artist, t.artwork_url, count(*)::int
  from public.plays pl
  join public.tracks t on t.id = pl.track_id
  where pl.user_id = p_user_id
    and pl.played_at > now() - interval '90 days' and pl.source = 'lastfm'
    and public.profile_stats_visible(p_user_id)
  group by t.id
  order by count(*) desc, max(pl.played_at) desc
  limit greatest(1, least(p_limit, 10));
$function$;

CREATE OR REPLACE FUNCTION public.profile_top_artists(p_user_id uuid, p_limit integer DEFAULT 5)
 RETURNS TABLE(artist text, artwork_url text, plays integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select t.artist, (array_agg(t.artwork_url order by pl.played_at desc) filter (where t.artwork_url is not null))[1], count(*)::int
  from public.plays pl
  join public.tracks t on t.id = pl.track_id
  where pl.user_id = p_user_id
    and pl.played_at > now() - interval '90 days' and pl.source = 'lastfm'
    and public.profile_stats_visible(p_user_id)
  group by t.artist
  order by count(*) desc, max(pl.played_at) desc
  limit greatest(1, least(p_limit, 10));
$function$;

CREATE OR REPLACE FUNCTION public.taste_match(p_other uuid)
 RETURNS TABLE(score integer, shared_artists text[], shared_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (
    select t.artist, ln(1 + count(*))::float8 as w
    from public.plays pl join public.tracks t on t.id = pl.track_id
    where pl.user_id = (select auth.uid()) and pl.played_at > now() - interval '90 days' and pl.source = 'lastfm'
    group by t.artist
  ),
  them as (
    select t.artist, ln(1 + count(*))::float8 as w
    from public.plays pl join public.tracks t on t.id = pl.track_id
    where pl.user_id = p_other and pl.played_at > now() - interval '90 days' and pl.source = 'lastfm'
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
$function$;

CREATE OR REPLACE FUNCTION public.people_you_might_click_with(p_limit integer DEFAULT 20)
 RETURNS TABLE(user_id uuid, handle text, display_name text, avatar_url text, school text, class_year integer, student_status text, prompt_key text, prompt_answer text, open_to text[], taste_score integer, shared_artists text[], shared_open_to text[], shared_genres text[], shared_concert text, both_new boolean, same_school boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (
    select p.id, p.university_id, p.school_id, p.open_to, p.genres, p.student_status
    from public.profiles p where p.id = (select auth.uid())
  ),
  candidates as (
    select p.*, s.short_name as school_short, (p.show_stats and not st.ghost_mode) as stats_visible
    from public.profiles p
    join me on me.university_id = p.university_id
    join public.user_settings st on st.user_id = p.id
    join public.schools s on s.id = p.school_id
    where p.id <> me.id
      and cardinality(p.open_to) > 0                       -- opted in to being suggested
      and not st.ghost_mode
      and not exists (                                      -- no block either way
        select 1 from public.blocks k
        where (k.blocker_id = me.id and k.blocked_id = p.id)
           or (k.blocker_id = p.id and k.blocked_id = me.id))
      and not exists (                                      -- not already friends or pending
        select 1 from public.friendships f
        where (f.requester_id = me.id and f.addressee_id = p.id)
           or (f.requester_id = p.id and f.addressee_id = me.id))
  ),
  -- Artist weights, as in taste_match(): plays per artist over 90 days, dampened with a log.
  my_artists as (
    select t.artist, ln(1 + count(*))::float8 as w
    from public.plays pl join public.tracks t on t.id = pl.track_id
    where pl.user_id = (select id from me) and pl.played_at > now() - interval '90 days' and pl.source = 'lastfm'
    group by t.artist
  ),
  their_artists as (
    select pl.user_id, t.artist, ln(1 + count(*))::float8 as w
    from public.plays pl
    join public.tracks t on t.id = pl.track_id
    join candidates c on c.id = pl.user_id and c.stats_visible
    where pl.played_at > now() - interval '90 days' and pl.source = 'lastfm'
    group by pl.user_id, t.artist
  ),
  their_norm as (
    select ta.user_id, sqrt(sum(ta.w * ta.w)) as norm, count(*) as artists
    from their_artists ta group by ta.user_id
  ),
  taste as (
    select tn.user_id,
           round(100 * coalesce(sum(ta.w * ma.w), 0)
                 / (tn.norm * (select sqrt(sum(w * w)) from my_artists)))::int as score,
           (array_agg(ta.artist order by least(ta.w, ma.w) desc, ta.artist)
              filter (where ma.artist is not null))[1:3] as shared
    from their_norm tn
    join their_artists ta on ta.user_id = tn.user_id
    left join my_artists ma on ma.artist = ta.artist
    where tn.artists >= 3 and (select count(*) from my_artists) >= 3
    group by tn.user_id, tn.norm
  ),
  scored as (
    select c.*,
           t.score as taste_score,
           coalesce(t.shared, '{}') as shared_artists,
           array(select unnest(c.open_to) intersect select unnest(me.open_to) order by 1) as shared_open_to,
           array(select unnest(c.genres) intersect select unnest(me.genres) order by 1) as shared_genres,
           (select mine.artist
              from public.profile_concerts mine
              join public.profile_concerts theirs
                on lower(theirs.artist) = lower(mine.artist) and theirs.user_id = c.id
             where mine.user_id = me.id and mine.status = 'going' and theirs.status = 'going'
               and coalesce(mine.event_date, current_date) >= current_date
             limit 1) as shared_concert,
           (c.student_status is not null and me.student_status is not null) as both_new,
           (c.school_id = me.school_id) as same_school
    from candidates c
    cross join me
    left join taste t on t.user_id = c.id
  )
  select s.id, s.handle, s.display_name, s.avatar_url,
         s.school_short, s.class_year, s.student_status,
         s.prompt_key, s.prompt_answer, s.open_to,
         s.taste_score, s.shared_artists,
         s.shared_open_to, s.shared_genres, s.shared_concert,
         s.both_new, s.same_school
  from scored s
  order by
      coalesce(s.taste_score, 0)
    + 12 * cardinality(s.shared_open_to)
    + 6  * cardinality(s.shared_genres)
    + case when s.shared_concert is not null then 15 else 0 end
    + case when s.both_new then 10 else 0 end
    + case when s.same_school then 3 else 0 end desc,
    s.handle
  limit greatest(1, least(p_limit, 50));
$function$;
