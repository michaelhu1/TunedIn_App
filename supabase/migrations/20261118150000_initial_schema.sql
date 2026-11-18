-- TunedIn initial schema: tables, row-level security, NYU reference data.
-- See docs/PROPOSAL.md section 6. Chart views arrive in a later migration (build step 5).
--
-- Access model in one paragraph:
--   The browser talks to Postgres as the `authenticated` role and can only do what the
--   policies below allow. Anything that must not be forgeable by a user (recording plays,
--   writing presence, enriching tracks) is done by server code using the service role,
--   which bypasses row-level security.

-- ---------------------------------------------------------------------------
-- Reference data: universities and their schools
-- ---------------------------------------------------------------------------

create table public.universities (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null unique,
  email_domain text not null unique check (email_domain = lower(email_domain))
);

create table public.schools (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities (id) on delete cascade,
  name          text not null,
  short_name    text not null,
  slug          text not null,
  unique (university_id, slug)
);

-- ---------------------------------------------------------------------------
-- Sign-up gate: only emails at a known university domain can create an account.
-- Enforced in the database so it holds no matter which client calls Supabase Auth.
-- Accepts the domain itself (nyu.edu) and its subdomains (stern.nyu.edu, law.nyu.edu).
-- ---------------------------------------------------------------------------

create function public.university_for_email(email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from public.universities u
  where lower(split_part(email, '@', 2)) = u.email_domain
     or lower(split_part(email, '@', 2)) like '%.' || u.email_domain
  limit 1;
$$;

create function public.enforce_university_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or public.university_for_email(new.email) is null then
    raise exception 'TunedIn sign-up requires a university email address (for example @nyu.edu).';
  end if;
  return new;
end;
$$;

create trigger enforce_university_email
  before insert or update of email on auth.users
  for each row execute function public.enforce_university_email();

-- ---------------------------------------------------------------------------
-- Profiles: the part of a user that other signed-in users can see
-- ---------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  handle        text not null unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  university_id uuid not null references public.universities (id),
  school_id     uuid not null references public.schools (id),
  avatar_url    text,
  created_at    timestamptz not null default now()
);

create index profiles_school_idx on public.profiles (school_id);

-- Settings: the part of a user only they can see. Kept in its own table because
-- row-level security hides whole rows, not individual columns.
create table public.user_settings (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  lastfm_username text,
  ghost_mode      boolean not null default false,  -- hide me from the map entirely
  share_location  boolean not null default false,  -- opt-in; off means music only, no cell
  last_active_at  timestamptz not null default now()  -- drives which users the poller checks
);

-- The university always comes from the verified email, never from the client,
-- and the chosen school must belong to that university.
create function public.profiles_set_university()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_email text;
begin
  select email into user_email from auth.users where id = new.id;
  new.university_id := public.university_for_email(user_email);
  if new.university_id is null then
    raise exception 'No university matches this account''s email.';
  end if;
  if not exists (
    select 1 from public.schools s
    where s.id = new.school_id and s.university_id = new.university_id
  ) then
    raise exception 'That school does not belong to your university.';
  end if;
  return new;
end;
$$;

create trigger profiles_set_university
  before insert or update on public.profiles
  for each row execute function public.profiles_set_university();

create function public.profiles_create_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;

create trigger profiles_create_settings
  after insert on public.profiles
  for each row execute function public.profiles_create_settings();

-- ---------------------------------------------------------------------------
-- Friendships: one row per pair, whichever direction the request went
-- ---------------------------------------------------------------------------

create type public.friendship_status as enum ('pending', 'accepted');

create table public.friendships (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       public.friendship_status not null default 'pending',
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

-- Stops A->B and B->A from both existing.
create unique index friendships_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id);

create function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a))
  );
$$;

-- ---------------------------------------------------------------------------
-- Music: tracks (shared cache), plays (history for charts), presence (live, no history)
-- ---------------------------------------------------------------------------

create table public.tracks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  artist      text not null,
  album       text,
  isrc        text,
  artwork_url text,
  preview_url text,
  deezer_id   bigint unique,
  itunes_id   bigint unique,
  spotify_id  text unique,
  created_at  timestamptz not null default now()
);

-- Last.fm gives us only artist + title, so that pair is the identity of a track.
create unique index tracks_artist_title_idx on public.tracks (lower(artist), lower(title));
create index tracks_isrc_idx on public.tracks (isrc);

create type public.play_source as enum ('lastfm', 'checkin');

-- Deliberately has no location column: listening history is never tied to a place.
create table public.plays (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  track_id  uuid not null references public.tracks (id),
  played_at timestamptz not null,
  source    public.play_source not null,
  unique (user_id, track_id, played_at)  -- makes re-polling the same scrobble a no-op
);

create index plays_played_at_idx on public.plays (played_at);
create index plays_user_idx on public.plays (user_id, played_at desc);

-- One row per user, overwritten in place, so there is no location history to leak.
-- geo_cell is a 6-character geohash (roughly 1.2 km x 0.6 km). The check constraint means
-- the database physically cannot store anything more precise than that.
create table public.presence (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  geo_cell   text check (geo_cell ~ '^[0-9bcdefghjkmnpqrstuvwxyz]{6}$'),
  track_id   uuid references public.tracks (id),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes'
);

create function public.is_ghost(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.ghost_mode from public.user_settings s where s.user_id = target), false);
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.universities  enable row level security;
alter table public.schools       enable row level security;
alter table public.profiles      enable row level security;
alter table public.user_settings enable row level security;
alter table public.friendships   enable row level security;
alter table public.tracks        enable row level security;
alter table public.plays         enable row level security;
alter table public.presence      enable row level security;

-- Reference data and the track cache are public (share pages work signed out).
create policy "universities are public" on public.universities for select using (true);
create policy "schools are public"      on public.schools      for select using (true);
create policy "tracks are public"       on public.tracks       for select using (true);

-- Profiles: any signed-in user can look people up; you can only write your own.
create policy "signed-in users can read profiles" on public.profiles
  for select to authenticated using (true);
create policy "create own profile" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Settings: owner only. Clients may change three columns; the rest is server-managed.
create policy "read own settings" on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "update own settings" on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke insert, update, delete on public.user_settings from anon, authenticated;
grant update (lastfm_username, ghost_mode, share_location) on public.user_settings to authenticated;

-- Friendships: both sides can see the row; only the requester can create it (as pending);
-- only the addressee can accept it; either side can delete it (decline, cancel, unfriend).
create policy "read own friendships" on public.friendships
  for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy "send friend request" on public.friendships
  for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending' and accepted_at is null);
create policy "accept friend request" on public.friendships
  for update to authenticated
  using (addressee_id = (select auth.uid()))
  with check (addressee_id = (select auth.uid()));
create policy "remove friendship" on public.friendships
  for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
-- Only status/accepted_at are editable, so an accept cannot be rewritten to point at someone else.
revoke update on public.friendships from anon, authenticated;
grant update (status, accepted_at) on public.friendships to authenticated;

-- Plays: you can read your own history. Charts read aggregates through views (step 5).
-- No client write policy: plays are recorded by the server so charts can't be stuffed.
create policy "read own plays" on public.plays
  for select to authenticated using (user_id = (select auth.uid()));

-- Presence: you see your own row, plus accepted friends who are not in ghost mode
-- and whose row has not expired. No client write policy: the server writes it.
create policy "read own and friends presence" on public.presence
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      expires_at > now()
      and public.are_friends((select auth.uid()), user_id)
      and not public.is_ghost(user_id)
    )
  );

-- Signed-out visitors get reference data and tracks only.
revoke all on public.profiles, public.user_settings, public.friendships,
              public.plays, public.presence from anon;
revoke insert, update, delete on public.universities, public.schools, public.tracks,
              public.plays, public.presence from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Launch data: NYU and its schools
-- ---------------------------------------------------------------------------

with nyu as (
  insert into public.universities (name, slug, email_domain)
  values ('New York University', 'nyu', 'nyu.edu')
  returning id
)
insert into public.schools (university_id, name, short_name, slug)
select nyu.id, s.name, s.short_name, s.slug
from nyu, (values
  ('College of Arts and Science',                              'CAS',            'cas'),
  ('Tandon School of Engineering',                             'Tandon',         'tandon'),
  ('Stern School of Business',                                 'Stern',          'stern'),
  ('Tisch School of the Arts',                                 'Tisch',          'tisch'),
  ('Steinhardt School of Culture, Education, and Human Development', 'Steinhardt', 'steinhardt'),
  ('Gallatin School of Individualized Study',                  'Gallatin',       'gallatin'),
  ('Liberal Studies',                                          'Liberal Studies','liberal-studies'),
  ('Rory Meyers College of Nursing',                           'Meyers',         'meyers'),
  ('Silver School of Social Work',                             'Silver',         'silver'),
  ('School of Professional Studies',                           'SPS',            'sps'),
  ('School of Global Public Health',                           'GPH',            'gph'),
  ('Graduate School of Arts and Science',                      'GSAS',           'gsas'),
  ('Courant Institute of Mathematical Sciences',               'Courant',        'courant'),
  ('Wagner Graduate School of Public Service',                 'Wagner',         'wagner'),
  ('School of Law',                                            'Law',            'law'),
  ('Grossman School of Medicine',                              'Grossman',       'grossman'),
  ('College of Dentistry',                                     'Dentistry',      'dentistry'),
  ('NYU Abu Dhabi',                                            'NYUAD',          'abu-dhabi'),
  ('NYU Shanghai',                                             'NYUSH',          'shanghai')
) as s (name, short_name, slug);
