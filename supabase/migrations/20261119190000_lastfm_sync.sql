-- Automatic plays from streaming services, read through Last.fm.
--
-- A person links Spotify (or another player) to a free Last.fm account once; from then on
-- Last.fm records everything they play, and TunedIn reads that public history. This file
-- adds what the reader needs to remember between runs, and a safe way to set "now playing".

alter table public.user_settings
  -- When we last asked Last.fm about this person (successful or not).
  add column lastfm_synced_at timestamptz,
  -- The newest play we have already imported; the next run only asks for plays after it.
  add column lastfm_cursor    timestamptz,
  -- 'ok', or why reading failed: 'not_found' (no such user), 'private' (they hide their
  -- recent tracks on Last.fm), 'error' (Last.fm was unreachable).
  add column lastfm_status    text check (lastfm_status in ('ok', 'not_found', 'private', 'error'));

-- Clients may still change only lastfm_username, ghost_mode and share_location (granted in
-- the initial schema). Changing the username starts the import over.
create function public.settings_reset_lastfm()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.lastfm_username is distinct from old.lastfm_username then
    new.lastfm_synced_at := null;
    new.lastfm_cursor := null;
    new.lastfm_status := null;
  end if;
  return new;
end;
$$;
create trigger settings_reset_lastfm
  before update of lastfm_username on public.user_settings
  for each row execute function public.settings_reset_lastfm();

-- Set someone's current song from an automatic play, without clobbering anything newer.
-- A manual check-in made after the play stays. The location cell is never touched.
-- `p_live` is true when Last.fm says the song is playing right now.
create function public.set_presence_from_play(p_user_id uuid, p_track_id uuid, p_played_at timestamptz, p_live boolean)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_at timestamptz := case when p_live then now() else p_played_at end;
begin
  -- Only plays from the current listening day can be "today's song".
  if public.listening_day(v_at) <> public.listening_day(now()) then
    return false;
  end if;

  insert into public.presence (user_id, track_id, updated_at, expires_at)
  values (p_user_id, p_track_id, v_at, public.listening_day_end())
  on conflict (user_id) do update set
    track_id   = excluded.track_id,
    updated_at = excluded.updated_at,
    expires_at = excluded.expires_at
  where public.presence.expires_at < now()            -- yesterday's leftover row
     or public.presence.track_id is null              -- location only, no song yet
     or public.presence.updated_at < excluded.updated_at;
  return found;
end;
$$;
revoke execute on function public.set_presence_from_play from public, anon, authenticated;
grant execute on function public.set_presence_from_play to service_role;
