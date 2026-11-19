-- "People you might click with": suggestions of members to meet, for the People tab.
--
-- WHO CAN APPEAR. Being suggested to strangers is more exposure than being findable by
-- handle, so it is opt-in: you appear only if you picked at least one "Open to" chip on
-- your profile, which is the explicit signal that it is fine to reach out. You never
-- appear while in ghost mode, to anyone you have a block with, or to people who are already
-- your friends or have a pending request with you. Same university only.
--
-- HOW PEOPLE ARE RANKED. Each suggestion gets points, and the reasons are returned so the
-- app can show WHY someone is suggested instead of a mystery ranking:
--   * taste match (0-100): the same artist-overlap score shown on profiles, used only when
--     the other person lets their stats be seen and both of you have enough listening;
--   * +12 for each "Open to" chip you share;
--   * +6 for each genre tag you share;
--   * +15 if you are both going to the same concert;
--   * +10 if you are both new this year (first-year or transfer);
--   * +3 if you are in the same school.
-- The weights are deliberately simple and live in one place below, so they are easy to
-- tune once real students are using it.

create function public.people_you_might_click_with(p_limit int default 20)
returns table (
  user_id uuid, handle text, display_name text, avatar_url text,
  school text, class_year int, student_status text,
  prompt_key text, prompt_answer text, open_to text[],
  taste_score int, shared_artists text[],
  shared_open_to text[], shared_genres text[], shared_concert text,
  both_new boolean, same_school boolean
)
language sql
stable
security definer
set search_path = ''
as $$
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
$$;

revoke execute on function public.people_you_might_click_with from public, anon;
grant execute on function public.people_you_might_click_with to authenticated;
