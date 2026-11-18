-- Step 3: turning a messy "artist + title" into one canonical row in `tracks`.
--
-- Why this exists: Last.fm might report "See You Again (feat. Kali Uchis)" while a manual
-- check-in picks "See You Again" from search. Both are the same song and must count as
-- one entry on the charts. So:
--   * `tracks` holds one row per real song, identified by its Deezer/iTunes id when known.
--   * `track_aliases` remembers every spelling we have seen and which track it resolved to,
--     so each spelling costs at most one metadata lookup, ever.

create table public.track_aliases (
  artist_key text not null,  -- lower(trim(artist)) as the source reported it
  title_key  text not null,  -- lower(trim(title)) as the source reported it
  track_id   uuid not null references public.tracks (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (artist_key, title_key)
);

-- Server-only table: row-level security on, and no policies, means clients get nothing.
alter table public.track_aliases enable row level security;
revoke all on public.track_aliases from anon, authenticated;

-- Insert a track or return the existing one. Match order: Deezer id, iTunes id, then
-- artist + title. Existing rows only gain missing details; they are never overwritten
-- with blanks.
create function public.upsert_track(
  p_title       text,
  p_artist      text,
  p_album       text default null,
  p_isrc        text default null,
  p_artwork_url text default null,
  p_preview_url text default null,
  p_deezer_id   bigint default null,
  p_itunes_id   bigint default null,
  p_spotify_id  text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select t.id into v_id
  from public.tracks t
  where (p_deezer_id is not null and t.deezer_id = p_deezer_id)
     or (p_itunes_id is not null and t.itunes_id = p_itunes_id)
     or (lower(t.artist) = lower(p_artist) and lower(t.title) = lower(p_title))
  order by (t.deezer_id is not distinct from p_deezer_id) desc
  limit 1;

  if v_id is null then
    insert into public.tracks
      (title, artist, album, isrc, artwork_url, preview_url, deezer_id, itunes_id, spotify_id)
    values
      (p_title, p_artist, p_album, p_isrc, p_artwork_url, p_preview_url, p_deezer_id, p_itunes_id, p_spotify_id)
    on conflict (lower(artist), lower(title)) do update set title = excluded.title
    returning id into v_id;
  else
    update public.tracks t set
      album       = coalesce(t.album, p_album),
      isrc        = coalesce(t.isrc, p_isrc),
      artwork_url = coalesce(p_artwork_url, t.artwork_url),
      preview_url = coalesce(p_preview_url, t.preview_url),
      deezer_id   = coalesce(t.deezer_id, p_deezer_id),
      itunes_id   = coalesce(t.itunes_id, p_itunes_id),
      spotify_id  = coalesce(t.spotify_id, p_spotify_id)
    where t.id = v_id;
  end if;

  return v_id;
end;
$$;

-- Only the server (service role) may call it.
revoke execute on function public.upsert_track from public, anon, authenticated;
grant execute on function public.upsert_track to service_role;
