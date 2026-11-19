-- The public map: "what are people around here listening to?"
--
-- The friends map shows individual friends. The public map shows AREAS: for each busy
-- location cell, how many people are listening there and the songs playing. It never shows
-- who. The rules that keep it that way are all in this file:
--
--   * An area appears only when at least `nearby_min_people` different people are in it
--     (5 by default). Fewer than that and it is hidden entirely, so an area can never
--     describe one or two identifiable people.
--   * Only people who turned on location sharing, are not in ghost mode, and have not
--     switched off "count me in area totals" are counted.
--   * "Right now" means: their location was sent in the last 3 hours and they have a song
--     today. A location from this morning does not count as being there this evening.
--   * The function returns totals and song titles only. No user ids, handles or photos
--     leave the database.

-- When each person's location cell was last sent, so stale locations can be left out.
alter table public.presence add column cell_at timestamptz;
update public.presence set cell_at = updated_at where geo_cell is not null;

-- A separate switch from "share location with friends": stay visible to friends on the
-- friends map but be left out of the anonymous public totals. On by default, because the
-- location opt-in explains both uses and these totals identify nobody.
alter table public.user_settings add column count_me_nearby boolean not null default true;
grant update (count_me_nearby) on public.user_settings to authenticated;

insert into public.app_settings (key, value, note) values
  ('nearby_min_people', '5',
   'An area on the public map only appears once this many different people are there with a song. Lower it to 1 while testing alone; keep it at 5 or more for real use.');

-- Friendly names for location cells around NYU, so the map can say "Washington Square"
-- instead of a code. A cell is roughly 1.2 km x 0.6 km, so each name is the best-known
-- place inside it. Cells without a name are shown as "This area".
create table public.places (
  cell text primary key check (cell ~ '^[0-9bcdefghjkmnpqrstuvwxyz]{6}$'),
  name text not null
);
alter table public.places enable row level security;
create policy "members can read place names" on public.places for select to authenticated using (true);
revoke all on public.places from anon;
revoke insert, update, delete on public.places from authenticated;

insert into public.places (cell, name) values
  ('dr5rsn', 'Washington Square'),
  ('dr5rsr', 'Union Square'),
  ('dr5rsq', 'Astor Place and Third North'),
  ('dr5rs2', 'Tandon and MetroTech'),
  ('dr5rsw', 'East Village'),
  ('dr5rsp', 'West Village'),
  ('dr5rsj', 'SoHo'),
  ('dr5ru2', 'Flatiron and Gramercy'),
  ('dr5rs7', 'Lower East Side'),
  ('dr5rsh', 'Chinatown'),
  ('dr5rkr', 'Downtown Brooklyn'),
  ('dr5rs3', 'DUMBO'),
  ('dr5rs0', 'Brooklyn Heights'),
  ('dr5ru1', 'Chelsea'),
  ('dr5ru6', 'Midtown South'),
  ('dr5reu', 'Tribeca'),
  ('dr5ref', 'Financial District'),
  ('dr5rkx', 'Fort Greene'),
  ('dr5rt4', 'Williamsburg');

-- Record when the cell was sent. Otherwise unchanged from 20261118200000.
create or replace function public.set_location_cell(p_user_id uuid, p_cell text)
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

  insert into public.presence (user_id, geo_cell, cell_at, updated_at, expires_at)
  values (p_user_id, p_cell, now(), now(), public.listening_day_end())
  on conflict (user_id) do update set
    geo_cell   = excluded.geo_cell,
    cell_at    = excluded.cell_at,
    expires_at = greatest(public.presence.expires_at, excluded.expires_at),
    updated_at = case when public.presence.expires_at < now() then excluded.updated_at
                      else public.presence.updated_at end,
    track_id   = case when public.presence.expires_at < now() then null
                      else public.presence.track_id end;
  return true;
end;
$$;

-- Going ghost or turning location off already wipes the cell; wipe its timestamp too.
create or replace function public.settings_clear_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ghost_mode or not new.share_location then
    update public.presence set geo_cell = null, cell_at = null
    where user_id = new.user_id and geo_cell is not null;
  end if;
  return new;
end;
$$;

-- The public map's data. One row per area that has enough people; `my_area` marks the area
-- the caller is in. `top_tracks` is a list of {track_id, title, artist, artwork_url,
-- listeners}, most-played first.
create function public.nearby_areas()
returns table (cell text, name text, people int, my_area boolean, top_tracks jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with present as (
    select pr.user_id, pr.geo_cell, pr.track_id
    from public.presence pr
    join public.user_settings s on s.user_id = pr.user_id
    where pr.geo_cell is not null
      and pr.track_id is not null
      and pr.expires_at > now()
      and pr.cell_at > now() - interval '3 hours'
      and s.share_location and not s.ghost_mode and s.count_me_nearby
  ),
  busy as (
    select p.geo_cell, count(*)::int as people
    from present p
    group by p.geo_cell
    having count(*) >= coalesce(
      (select (value #>> '{}')::int from public.app_settings where key = 'nearby_min_people'), 5)
  ),
  songs as (
    select p.geo_cell, t.id, t.title, t.artist, t.artwork_url, count(*)::int as listeners,
           row_number() over (partition by p.geo_cell order by count(*) desc, t.title) as rn
    from present p
    join busy b on b.geo_cell = p.geo_cell
    join public.tracks t on t.id = p.track_id
    group by p.geo_cell, t.id
  )
  select b.geo_cell,
         coalesce(pl.name, 'This area'),
         b.people,
         exists (select 1 from public.presence me
                  where me.user_id = (select auth.uid()) and me.geo_cell = b.geo_cell and me.expires_at > now()),
         (select jsonb_agg(jsonb_build_object(
                   'track_id', s.id, 'title', s.title, 'artist', s.artist,
                   'artwork_url', s.artwork_url, 'listeners', s.listeners) order by s.rn)
            from songs s where s.geo_cell = b.geo_cell and s.rn <= 5)
  from busy b
  left join public.places pl on pl.cell = b.geo_cell
  order by b.people desc, b.geo_cell;
$$;

revoke execute on function public.nearby_areas from public, anon;
grant execute on function public.nearby_areas to authenticated;

-- Lets the app say "an area needs N people" in its explanations without exposing the
-- settings table.
create function public.nearby_min_people()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::int from public.app_settings where key = 'nearby_min_people'), 5);
$$;
revoke execute on function public.nearby_min_people from public, anon;
grant execute on function public.nearby_min_people to authenticated;
