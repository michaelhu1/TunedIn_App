-- Report and block.
--
-- BLOCK is instant and private. Once A blocks B:
--   * any friendship or pending request between them is removed, so neither is on the
--     other's map or friends list;
--   * neither can find the other: profile lookups, friend requests, top-listener lists,
--     top songs and taste match all behave as if the other person is not on TunedIn;
--   * B is never told. From B's side, A's profile simply reads "nobody here by that name".
-- Only the person who blocked can undo it.
--
-- REPORT sends a note to the people running TunedIn. The reported person is never told who
-- reported them. A copy of what their profile said at that moment is saved with the report,
-- because they could edit it afterwards.

-- ---------------------------------------------------------------------------
-- Blocks
-- ---------------------------------------------------------------------------

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;
-- You can see, create and remove only the blocks YOU made. You cannot see who blocked you.
create policy "see own blocks" on public.blocks
  for select to authenticated using (blocker_id = (select auth.uid()));
create policy "block someone" on public.blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy "unblock" on public.blocks
  for delete to authenticated using (blocker_id = (select auth.uid()));
revoke all on public.blocks from anon;
revoke update on public.blocks from authenticated;

-- True if either person has blocked the other. Only answers about the caller, so it cannot
-- be used to discover who has blocked whom.
create function public.blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.uid()) in (a, b), false)
     and exists (
       select 1 from public.blocks k
       where (k.blocker_id = a and k.blocked_id = b)
          or (k.blocker_id = b and k.blocked_id = a)
     );
$$;
revoke execute on function public.blocked_between from public, anon;
grant execute on function public.blocked_between to authenticated, service_role;

-- Blocking ends the friendship (or pending request) in the same transaction.
create function public.blocks_end_friendship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.friendships f
  where (f.requester_id = new.blocker_id and f.addressee_id = new.blocked_id)
     or (f.requester_id = new.blocked_id and f.addressee_id = new.blocker_id);
  return new;
end;
$$;
create trigger blocks_end_friendship
  after insert on public.blocks
  for each row execute function public.blocks_end_friendship();

-- Profiles: a blocked pair cannot see each other's profile row at all. Everything that
-- shows a person joins through this table, so this one rule covers lookups by handle,
-- the friends list and the map.
drop policy "signed-in users can read profiles" on public.profiles;
create policy "members can read profiles, except across a block" on public.profiles
  for select to authenticated
  using (not public.blocked_between((select auth.uid()), id));

-- Friend requests cannot be sent across a block (in either direction).
drop policy "send friend request" on public.friendships;
create policy "send friend request" on public.friendships
  for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and status = 'pending'
    and accepted_at is null
    and not public.blocked_between(requester_id, addressee_id)
  );

-- Top songs, top artists and taste match all go through this check, so adding the block
-- here covers all three.
create or replace function public.profile_stats_visible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
      or (
        not public.blocked_between((select auth.uid()), p_user_id)
        and exists (
          select 1
          from public.profiles p
          join public.user_settings s on s.user_id = p.id
          where p.id = p_user_id and p.show_stats and not s.ghost_mode
        )
      );
$$;

-- Top listeners: leave out anyone the viewer has a block with. (Their plays still count
-- toward song and artist charts, which are anonymous totals.)
create or replace function public.chart_top_listeners(p_school_slug text default null, p_days int default 7, p_limit int default 25)
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
      and not public.blocked_between((select auth.uid()), l.user_id)
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

-- The "Blocked people" list under Me. Needed because the profile rule above hides blocked
-- people from the person who blocked them too; this returns just enough to unblock.
create function public.my_blocks()
returns table (blocked_id uuid, handle text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select k.blocked_id, p.handle, k.created_at
  from public.blocks k
  join public.profiles p on p.id = k.blocked_id
  where k.blocker_id = (select auth.uid())
  order by k.created_at desc;
$$;
revoke execute on function public.my_blocks from public, anon;
grant execute on function public.my_blocks to authenticated;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid references public.profiles (id) on delete set null,
  reported_user_id uuid not null references public.profiles (id) on delete cascade,
  reason           text not null check (reason in ('harassment', 'inappropriate', 'impersonation', 'spam', 'other')),
  details          text check (char_length(details) <= 500),
  -- What the reported profile said when the report was made (filled in by the trigger below).
  snapshot         jsonb,
  status           text not null default 'open' check (status in ('open', 'reviewed', 'actioned', 'dismissed')),
  created_at       timestamptz not null default now(),
  check (reporter_id is null or reporter_id <> reported_user_id)
);
create index reports_open_idx on public.reports (created_at desc) where status = 'open';
-- One open report per person about another: stops a single user flooding the queue.
create unique index reports_one_open_per_pair
  on public.reports (reporter_id, reported_user_id) where status = 'open';

alter table public.reports enable row level security;
-- Members can file a report and nothing else. Nobody can read reports through the app,
-- not even their own: they are reviewed in the Supabase dashboard.
create policy "file a report" on public.reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));
revoke all on public.reports from anon, authenticated;
grant insert (reporter_id, reported_user_id, reason, details) on public.reports to authenticated;

create function public.reports_take_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select jsonb_build_object(
    'handle', p.handle, 'display_name', p.display_name, 'bio', p.bio,
    'avatar_url', p.avatar_url, 'instagram', p.instagram,
    'prompt_key', p.prompt_key, 'prompt_answer', p.prompt_answer, 'music_note', p.music_note,
    'links', (select coalesce(jsonb_agg(jsonb_build_object('title', l.title, 'url', l.url)), '[]'::jsonb)
              from public.profile_links l where l.user_id = p.id),
    'concerts', (select coalesce(jsonb_agg(jsonb_build_object('artist', c.artist, 'venue', c.venue)), '[]'::jsonb)
                 from public.profile_concerts c where c.user_id = p.id)
  )
  into new.snapshot
  from public.profiles p where p.id = new.reported_user_id;
  return new;
end;
$$;
create trigger reports_take_snapshot
  before insert on public.reports
  for each row execute function public.reports_take_snapshot();

-- The profile extras (favourites, links, concerts) are readable by members by user id, so
-- they need the same rule as the profile itself: nothing across a block.
drop policy "members can read favourites" on public.profile_favorites;
create policy "members can read favourites, except across a block" on public.profile_favorites
  for select to authenticated using (not public.blocked_between((select auth.uid()), user_id));
drop policy "members can read links" on public.profile_links;
create policy "members can read links, except across a block" on public.profile_links
  for select to authenticated using (not public.blocked_between((select auth.uid()), user_id));
drop policy "members can read concerts" on public.profile_concerts;
create policy "members can read concerts, except across a block" on public.profile_concerts
  for select to authenticated using (not public.blocked_between((select auth.uid()), user_id));
