-- Step 7: friends and the map.
--
-- The tables and the "who can see whom" policies already exist (initial schema). This file
-- adds the pieces that write location, and makes the privacy switches take effect instantly.
--
-- Location rules, all enforced here in the database:
--   * The server only ever receives a 6-character geohash cell (about 1.2 km x 0.6 km).
--     The phone does the rounding. The column cannot hold anything finer.
--   * A cell is stored only while the person has "share location" on and ghost mode off.
--   * Turning either switch the private way wipes the stored cell in the same transaction.
--   * There is one row per person, overwritten each time, cleared at the end of the
--     listening day. No history exists to leak.

-- Store my current cell. Called by the server with the signed-in user's id.
-- Returns false (and stores nothing) if the person has not opted in.
create function public.set_location_cell(p_user_id uuid, p_cell text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  allowed boolean;
begin
  select s.share_location and not s.ghost_mode into allowed
  from public.user_settings s where s.user_id = p_user_id;
  if not coalesce(allowed, false) then
    return false;
  end if;

  -- A person who has not checked in today still appears on the map (without a song)
  -- until the listening day ends. An existing song is left as it is.
  insert into public.presence (user_id, geo_cell, updated_at, expires_at)
  values (p_user_id, p_cell, now(), public.listening_day_end())
  on conflict (user_id) do update set
    geo_cell   = excluded.geo_cell,
    expires_at = greatest(public.presence.expires_at, excluded.expires_at),
    -- "updated_at" keeps meaning "when the song was set", so only touch it for a fresh row.
    updated_at = case when public.presence.expires_at < now() then excluded.updated_at
                      else public.presence.updated_at end,
    track_id   = case when public.presence.expires_at < now() then null
                      else public.presence.track_id end;
  return true;
end;
$$;
revoke execute on function public.set_location_cell from public, anon, authenticated;
grant execute on function public.set_location_cell to service_role;

-- The privacy switches act immediately: going ghost or turning location sharing off
-- erases the stored cell, instead of waiting for it to expire.
create function public.settings_clear_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ghost_mode or not new.share_location then
    update public.presence set geo_cell = null where user_id = new.user_id and geo_cell is not null;
  end if;
  return new;
end;
$$;

create trigger settings_clear_location
  after update of ghost_mode, share_location on public.user_settings
  for each row execute function public.settings_clear_location();

-- Friends list for the Friends screen and the map: every friendship I am part of, with the
-- other person's public profile. Runs as the caller, so the existing policies decide what
-- is visible (only rows I am in).
create view public.my_friendships
with (security_invoker = true)
as
select
  f.status,
  f.created_at,
  (f.requester_id = (select auth.uid())) as sent_by_me,
  p.id as friend_id,
  p.handle,
  p.avatar_url,
  s.short_name as school
from public.friendships f
join public.profiles p
  on p.id = case when f.requester_id = (select auth.uid()) then f.addressee_id else f.requester_id end
join public.schools s on s.id = p.school_id
where (select auth.uid()) in (f.requester_id, f.addressee_id);

revoke all on public.my_friendships from anon;
grant select on public.my_friendships to authenticated;

-- Tighten a helper from the initial schema. It was callable with any two ids, which let a
-- signed-in user ask "are A and B friends?" about other people. It now only answers when
-- the caller is one of the two (the map policy always asks about the caller).
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.uid()) in (a, b), false)
     and exists (
       select 1 from public.friendships f
       where f.status = 'accepted'
         and ((f.requester_id = a and f.addressee_id = b)
           or (f.requester_id = b and f.addressee_id = a))
     );
$$;
revoke execute on function public.are_friends from public, anon;
grant execute on function public.are_friends to authenticated, service_role;
