-- Favourite artists: up to five, picked at sign-up.
--
-- Sign-up no longer asks anyone to connect a streaming service first. Instead a new person
-- taps a few artists they like and goes straight into the app. That gives a brand new
-- account something to show on its profile and something to be matched on ("you both like
-- SZA") before a single play has arrived.

alter table public.profiles
  add column favorite_artists text[] not null default '{}'
  check (cardinality(favorite_artists) <= 5);

-- Deliberately NOT added to the columns a member may update directly. The server sets it
-- after checking each name against the music catalogue, so it only ever holds real artist
-- names in their proper spelling (see app/src/app/api/profile/artists/route.ts).

-- "People you might click with" now also counts shared favourite artists: 8 points each,
-- and they are returned so the card can say so. The function returns one more column, so it
-- has to be dropped and created again; the body is otherwise the same as in *_discover.sql.
drop function public.people_you_might_click_with(int);

create function public.people_you_might_click_with(p_limit integer DEFAULT 20)
 RETURNS TABLE(user_id uuid, handle text, display_name text, avatar_url text, school text, class_year integer, student_status text, prompt_key text, prompt_answer text, open_to text[], taste_score integer, shared_artists text[], shared_open_to text[], shared_genres text[], shared_concert text, both_new boolean, same_school boolean, shared_favorites text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (
    select p.id, p.university_id, p.school_id, p.open_to, p.genres, p.student_status, p.favorite_artists
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
    where pl.user_id = (select id from me) and pl.played_at > now() - interval '90 days'
    group by t.artist
  ),
  their_artists as (
    select pl.user_id, t.artist, ln(1 + count(*))::float8 as w
    from public.plays pl
    join public.tracks t on t.id = pl.track_id
    join candidates c on c.id = pl.user_id and c.stats_visible
    where pl.played_at > now() - interval '90 days'
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
           (c.school_id = me.school_id) as same_school,
           -- Favourite artists both people picked at sign-up (compared without regard to case).
           array(select f from unnest(c.favorite_artists) f
                  where lower(f) in (select lower(m) from unnest(me.favorite_artists) m) order by 1) as shared_favorites
    from candidates c
    cross join me
    left join taste t on t.user_id = c.id
  )
  select s.id, s.handle, s.display_name, s.avatar_url,
         s.school_short, s.class_year, s.student_status,
         s.prompt_key, s.prompt_answer, s.open_to,
         s.taste_score, s.shared_artists,
         s.shared_open_to, s.shared_genres, s.shared_concert,
         s.both_new, s.same_school, s.shared_favorites
  from scored s
  order by
      coalesce(s.taste_score, 0)
    + 12 * cardinality(s.shared_open_to)
    + 6  * cardinality(s.shared_genres)
    + 8  * cardinality(s.shared_favorites)
    + case when s.shared_concert is not null then 15 else 0 end
    + case when s.both_new then 10 else 0 end
    + case when s.same_school then 3 else 0 end desc,
    s.handle
  limit greatest(1, least(p_limit, 50));
$function$;

revoke execute on function public.people_you_might_click_with from public, anon;
grant execute on function public.people_you_might_click_with to authenticated;
