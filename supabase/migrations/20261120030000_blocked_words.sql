-- Keep slurs out of profiles.
--
-- Ordinary swearing is allowed, and so are words people use casually among friends (the
-- owner's call: the n-word ending in "a", and "retard"). This only stops hard slurs (racist,
-- homophobic and transphobic terms) in the text people write about themselves: handle, name, bio, pronouns,
-- major, hometown, prompt answer, music note, playlist titles and concert venues.
--
-- The browser talks to the database directly, so the rule has to live here to mean anything.
--
-- How it works
--   * Text is lowercased, common letter swaps are undone (0 for o, 1 for i, 3 for e, 4 for a,
--     5 for s, 7 for t, @ for a, $ for s), and it is split into words.
--   * Each word is compared, as a hash, with a short list. The list is stored as hashes so
--     that this open-source repository does not contain the words themselves.
--   * Whole words only. That avoids blocking innocent text that merely contains a bad word
--     inside it (a place called Scunthorpe, the surname Dickinson), at the cost of missing
--     a slur glued to other letters. Stretched letters are caught.
--
-- It is a floor, not a moderator: Report on every profile is still how people flag the rest.

create function public.has_blocked_word(p_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with words as (
    select w
    from regexp_split_to_table(
      translate(lower(coalesce(p_text, '')), '013457@$', 'oieastas'), '[^a-z]+') as w
    where length(w) between 3 and 20
  ),
  forms as (
    -- as written, and with stretched letters squeezed to one or to two
    select w as f from words
    union select regexp_replace(w, '(.)\1{2,}', '\1', 'g') from words
    union select regexp_replace(w, '(.)\1{2,}', '\1\1', 'g') from words
  )
  select exists (
    select 1 from forms
    where md5(f) in (
    '02496caf8b1f24696662f7251ab485d6',
    '038e807e75bb90bf7c8f2cc3ee754a7b',
    '05d3ee7d162e091298e87eaed1195670',
    '066fc7b468bbf62055fe69a4f097de90',
    '1ebcb6a6dab1668b63649c30e65ca82e',
    '2b5a15d9f8f1dcf9a890692de7d44477',
    '2d2b0783a2ca0e0df1e60fd7dd24d526',
    '2ea76074f435b632da8c40fed59333bf',
    '37eee4e91ccb5208a77c59a84770e13f',
    '54adc7b9f243d0ec25757f30ff43909f',
    '5c157ce616cf05a467e7af785d434809',
    '6d43b39a0bec0a871a68482e787177e6',
    '6d892e8e395f9b010aad0598a086f8d7',
    '848908bf8a95da5c02067fbb8e714f86',
    '89116b7f25f9b630cb70569fc78e6de3',
    'a37620bc5641c271668c1cda396eeb6f',
    'abfb6c665e560c5f38f710bd4439f9f9',
    'b1860783a249a02405f6988c9e83f65a',
    'b18d29071d9091450a335cc6bd861365',
    'b5d3dcd596034b41f7f4d8908bec7abc',
    'b9da657f3b91836dcd0f4bc960076cac',
    'ba5223adcaaf7b25dfb308930b125449',
    'bf4b3ba0692b4378406f3df1df1e326a',
    'bf4b7336538de8c86aa71732ab9db5ac',
    'c35312fb3a7e05b7a44db2326bd29040',
    'c592eff5625d551b0c5be656377ff871',
    'cb205edee16b24366c871cf55e781346',
    'dd97792af0d416770793f4699ca2b878',
    'e1a95f7d9eabed5a3f2af062f5c837d5',
    'f5ab462e064d758a6e082ddb6d991ac0',
    'f9e06fb9d5ff2500fb76873475d7636d',
    'feb3d1b8115e4a252ff280c3f7e25796'
    )
  );
$$;
revoke execute on function public.has_blocked_word from public, anon;
grant execute on function public.has_blocked_word to authenticated, service_role;

create function public.refuse_blocked_words()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  body text;
begin
  if tg_table_name = 'profiles' then
    body := concat_ws(' ', new.handle, new.display_name, new.bio, new.pronouns, new.major, new.hometown,
                      new.prompt_answer, new.music_note);
  elsif tg_table_name = 'profile_links' then
    body := new.title;
  elsif tg_table_name = 'profile_concerts' then
    -- The venue only: artist names are what they are.
    body := new.venue;
  end if;
  if public.has_blocked_word(body) then
    -- The app looks for this exact message to explain what happened.
    raise exception 'blocked_word' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger refuse_blocked_words before insert or update on public.profiles
  for each row execute function public.refuse_blocked_words();
create trigger refuse_blocked_words before insert or update on public.profile_links
  for each row execute function public.refuse_blocked_words();
create trigger refuse_blocked_words before insert or update on public.profile_concerts
  for each row execute function public.refuse_blocked_words();
