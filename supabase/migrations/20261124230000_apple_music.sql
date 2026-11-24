-- Apple Music as a second automatic source of plays, next to Last.fm.
--
-- A person presses "Connect Apple Music" and approves in Apple's own window. Apple hands the
-- app a "Music User Token": a long random string that lets us ask Apple, on that person's
-- behalf, which songs they played recently. The reader (app/src/lib/apple-music-sync.ts)
-- asks every minute or so and records what is new. See docs/APPLE_MUSIC.md.
--
-- Two places hold the state:
--   * user_settings gets three columns the person may READ (is it connected, is it working).
--   * apple_music_links holds the token itself. No policy grants access to it, so only
--     server code can read it. A token is a credential and must never reach a browser,
--     not even its owner's.

alter type public.play_source add value if not exists 'apple_music';

alter table public.user_settings
  -- When the person connected Apple Music. Null means not connected.
  add column apple_music_connected_at timestamptz,
  -- When we last asked Apple about this person (successful or not).
  add column apple_music_synced_at    timestamptz,
  -- 'ok', or why reading failed: 'expired' (Apple no longer accepts the token: it ran out,
  -- the person removed TunedIn's access, or their subscription ended), 'error' (Apple was
  -- unreachable).
  add column apple_music_status       text check (apple_music_status in ('ok', 'expired', 'error'));
-- None of these is added to the columns a client may update: only server code sets them.

create table public.apple_music_links (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  music_user_token text not null,
  -- Apple's "recently played" list as it looked last time, newest first. Apple gives no
  -- play times, so new plays are found by comparing the list with this one. Null until the
  -- first read, which only records the list and imports nothing.
  recent_ids       text[],
  created_at       timestamptz not null default now()
);
alter table public.apple_music_links enable row level security;
-- Deliberately no policies, and no table rights for clients at all.
revoke all on public.apple_music_links from anon, authenticated;

-- One automatic source at a time. Someone who sends Apple Music plays to Last.fm AND
-- connects Apple Music here would have every play recorded twice. Connecting Last.fm
-- therefore disconnects Apple Music; the app does the reverse when Apple Music is connected.
-- Security definer because the person changing their Last.fm username has no rights on
-- apple_music_links.
create function public.settings_lastfm_replaces_apple_music()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lastfm_username is not null and new.lastfm_username is distinct from old.lastfm_username then
    new.apple_music_connected_at := null;
    new.apple_music_synced_at := null;
    new.apple_music_status := null;
    delete from public.apple_music_links where user_id = new.user_id;
  end if;
  return new;
end;
$$;
create trigger settings_lastfm_replaces_apple_music
  before update of lastfm_username on public.user_settings
  for each row execute function public.settings_lastfm_replaces_apple_music();

-- "Automatic" on the leaderboard and the streaming totals on the numbers page meant "from
-- Last.fm". They now mean "from any streaming source", written as "not set by hand" so a
-- future source needs no further change here. Both functions are long and only these
-- expressions change, so they are patched in place; grants are kept.
do $$
declare
  fn text;
  def text;
begin
  foreach fn in array array['chart_top_listeners', 'admin_stats'] loop
    select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = fn;
    if def is null or position('source = ''lastfm''' in def) = 0 then
      raise exception '% does not look the way this migration expects', fn;
    end if;
    def := replace(def, 'source = ''lastfm''', 'source <> ''checkin''');
    if fn = 'admin_stats' then
      if position('where lastfm_username is not null' in def) = 0 then
        raise exception 'admin_stats does not look the way this migration expects';
      end if;
      def := replace(def, 'where lastfm_username is not null',
                          'where lastfm_username is not null or apple_music_connected_at is not null');
    end if;
    execute def;
  end loop;
end;
$$;
