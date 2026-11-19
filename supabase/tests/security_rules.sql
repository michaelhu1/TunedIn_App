-- Security rules test. Acts as different users and tries to break the rules in
-- supabase/migrations. Every step says what it expects; the whole thing runs in one
-- transaction and rolls back, so it leaves no data behind.
--
-- Run against the local database:
--   docker exec -i supabase_db_TunedIn_App psql -U postgres -q < supabase/tests/security_rules.sql

\set ON_ERROR_STOP 0
\set VERBOSITY terse
begin;
\echo '== 1 gmail signup (expect ERROR)'
savepoint s; insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000f','x@gmail.com'); rollback to s;
\echo '== 2 evilnyu.edu signup (expect ERROR)'
savepoint s; insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000e','x@evilnyu.edu'); rollback to s;
\echo '== 3 nyu + stern.nyu signups (expect OK)'
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a','a@nyu.edu'),
 ('00000000-0000-0000-0000-00000000000b','b@stern.nyu.edu'),
 ('00000000-0000-0000-0000-00000000000c','c@NYU.edu');
select set_config('t.school', (select id::text from public.schools where slug='tandon'), false);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
\echo '== 4 A creates profile (OK), bad handle (ERROR), profile for B (ERROR)'
insert into public.profiles (id, handle, university_id, school_id) values ('00000000-0000-0000-0000-00000000000a','alice', gen_random_uuid(), current_setting('t.school')::uuid);
savepoint s; insert into public.profiles (id, handle, university_id, school_id) values ('00000000-0000-0000-0000-00000000000a','Al!', gen_random_uuid(), current_setting('t.school')::uuid); rollback to s;
savepoint s; insert into public.profiles (id, handle, university_id, school_id) values ('00000000-0000-0000-0000-00000000000b','bobfake', gen_random_uuid(), current_setting('t.school')::uuid); rollback to s;
reset role;
insert into public.profiles (id, handle, university_id, school_id) values
 ('00000000-0000-0000-0000-00000000000b','bob', gen_random_uuid(), current_setting('t.school')::uuid),
 ('00000000-0000-0000-0000-00000000000c','cara', gen_random_uuid(), current_setting('t.school')::uuid);
insert into public.tracks (id,title,artist) values ('00000000-0000-0000-0000-0000000000aa','Espresso','Sabrina Carpenter');
insert into public.presence (user_id, geo_cell, track_id) values
 ('00000000-0000-0000-0000-00000000000b','dr5rs0','00000000-0000-0000-0000-0000000000aa'),
 ('00000000-0000-0000-0000-00000000000c','dr5rs1','00000000-0000-0000-0000-0000000000aa');
\echo '== 5 precise 7-char cell (expect ERROR)'
savepoint s; update public.presence set geo_cell='dr5rs0x' where user_id='00000000-0000-0000-0000-00000000000b'; rollback to s;

set local role authenticated;
\echo '== 6 A: settings visible (1), presence visible (0), profiles (3 plus any sample users)'
select count(*) from public.user_settings; select count(*) from public.presence; select count(*) from public.profiles;
\echo '== 7 A: forge accepted friendship (ERROR), forge request from B (ERROR), real request (OK)'
savepoint s; insert into public.friendships (requester_id, addressee_id, status) values ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b','accepted'); rollback to s;
savepoint s; insert into public.friendships (requester_id, addressee_id) values ('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a'); rollback to s;
insert into public.friendships (requester_id, addressee_id) values ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b');
\echo '== 8 A accepts own request (expect UPDATE 0); A still sees 0 presence'
update public.friendships set status='accepted' where requester_id='00000000-0000-0000-0000-00000000000a';
select count(*) from public.presence;
\echo '== 9 A writes: presence (ERROR), plays (ERROR), last_active_at (ERROR), ghost (UPDATE 1)'
savepoint s; insert into public.presence (user_id, geo_cell) values ('00000000-0000-0000-0000-00000000000a','dr5rs0'); rollback to s;
savepoint s; insert into public.plays (user_id, track_id, played_at, source) values ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000aa', now(),'checkin'); rollback to s;
savepoint s; update public.user_settings set last_active_at = now(); rollback to s;
savepoint s; update public.user_settings set ghost_mode = true; rollback to s;

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 10 B: reverse dup request (ERROR), repoint requester (ERROR), accept (UPDATE 1)'
savepoint s; insert into public.friendships (requester_id, addressee_id) values ('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a'); rollback to s;
savepoint s; update public.friendships set requester_id='00000000-0000-0000-0000-00000000000c' where addressee_id='00000000-0000-0000-0000-00000000000b'; rollback to s;
update public.friendships set status='accepted', accepted_at=now() where addressee_id='00000000-0000-0000-0000-00000000000b';

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
\echo '== 11 A now sees friend B only (expect 1 row: bob-side cell dr5rs0)'
select geo_cell from public.presence;
reset role;
update public.user_settings set ghost_mode=true where user_id='00000000-0000-0000-0000-00000000000b';
set local role authenticated;
\echo '== 12 B ghost: A sees 0'
select count(*) from public.presence;
reset role;
update public.user_settings set ghost_mode=false where user_id='00000000-0000-0000-0000-00000000000b';
update public.presence set expires_at = now() - interval '1 minute';
set local role authenticated;
\echo '== 13 expired: A sees 0'
select count(*) from public.presence;
set local role anon;
\echo '== 14 anon: schools (19), tracks (1 plus any sample tracks), profiles (ERROR)'
select count(*) from public.schools; select count(*) from public.tracks;
savepoint s; select count(*) from public.profiles; rollback to s;

-- ===========================================================================
-- Profiles (migration 20261119150000_profiles.sql): profile fields, favourites,
-- playlist links, top-songs visibility and the avatars storage bucket.
-- Users: A = alice (...0a), B = bob (...0b), C = cara (...0c), all created above.
-- ===========================================================================
reset role;
-- Setup as the database owner: some plays for B, and one favourite each for A and B
-- (favourites can only be added by the server, so the test adds them the same way).
insert into public.plays (user_id, track_id, played_at, source) values
 ('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000aa', now() - interval '1 day','checkin'),
 ('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000aa', now() - interval '2 days','checkin');
insert into public.profile_favorites (user_id, position, track_id) values
 ('00000000-0000-0000-0000-00000000000a', 1, '00000000-0000-0000-0000-0000000000aa'),
 ('00000000-0000-0000-0000-00000000000b', 1, '00000000-0000-0000-0000-0000000000aa');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
\echo '== 15 A profile fields: bio 161 chars (ERROR), display name 41 chars (ERROR), class_year 1990 (ERROR), valid edit (UPDATE 1)'
savepoint s; update public.profiles set bio = repeat('x', 161) where id='00000000-0000-0000-0000-00000000000a'; rollback to s;
savepoint s; update public.profiles set display_name = repeat('x', 41) where id='00000000-0000-0000-0000-00000000000a'; rollback to s;
savepoint s; update public.profiles set class_year = 1990 where id='00000000-0000-0000-0000-00000000000a'; rollback to s;
with u as (update public.profiles set bio = repeat('x', 160), display_name = 'Alice', class_year = 2027 where id='00000000-0000-0000-0000-00000000000a' returning 1) select count(*) as updated from u;
\echo '== 16 A ungranted columns: created_at (ERROR), university_id (ERROR); B profile (UPDATE 0)'
savepoint s; update public.profiles set created_at = now() - interval '10 years' where id='00000000-0000-0000-0000-00000000000a'; rollback to s;
savepoint s; update public.profiles set university_id = gen_random_uuid() where id='00000000-0000-0000-0000-00000000000a'; rollback to s;
with u as (update public.profiles set bio = 'hacked' where id='00000000-0000-0000-0000-00000000000b' returning 1) select count(*) as updated from u;
\echo '== 17 A avatar_url: external host (ERROR), own bucket URL (UPDATE 1)'
savepoint s; update public.profiles set avatar_url = 'https://evil.example/a.jpg' where id='00000000-0000-0000-0000-00000000000a'; rollback to s;
with u as (update public.profiles set avatar_url = 'http://127.0.0.1:54321/storage/v1/object/public/avatars/00000000-0000-0000-0000-00000000000a/1.jpg' where id='00000000-0000-0000-0000-00000000000a' returning 1) select count(*) as updated from u;

\echo '== 18 favourites: A direct insert (ERROR), A reads B favourite (expect 1)'
savepoint s; insert into public.profile_favorites (user_id, position, track_id) values ('00000000-0000-0000-0000-00000000000a', 2, '00000000-0000-0000-0000-0000000000aa'); rollback to s;
select count(*) from public.profile_favorites where user_id='00000000-0000-0000-0000-00000000000b';
\echo '== 19 favourites: A deletes B favourite (DELETE 0), A deletes own (DELETE 1)'
with d as (delete from public.profile_favorites where user_id='00000000-0000-0000-0000-00000000000b' returning 1) select count(*) as deleted from d;
with d as (delete from public.profile_favorites where user_id='00000000-0000-0000-0000-00000000000a' returning 1) select count(*) as deleted from d;

\echo '== 20 links: unlisted host (ERROR), http:// (ERROR), javascript: (ERROR)'
savepoint s; insert into public.profile_links (user_id, position, title, url) values ('00000000-0000-0000-0000-00000000000a', 1, 'Mix', 'https://evil.example/playlist'); rollback to s;
savepoint s; insert into public.profile_links (user_id, position, title, url) values ('00000000-0000-0000-0000-00000000000a', 1, 'Mix', 'http://open.spotify.com/playlist/abc'); rollback to s;
savepoint s; insert into public.profile_links (user_id, position, title, url) values ('00000000-0000-0000-0000-00000000000a', 1, 'Mix', 'javascript:alert(1)'); rollback to s;
\echo '== 21 links: valid Spotify (INSERT 1), position 4 (ERROR), link for B (ERROR)'
with i as (insert into public.profile_links (user_id, position, title, url) values ('00000000-0000-0000-0000-00000000000a', 1, 'Mix', 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M') returning 1) select count(*) as inserted from i;
savepoint s; insert into public.profile_links (user_id, position, title, url) values ('00000000-0000-0000-0000-00000000000a', 4, 'Mix', 'https://open.spotify.com/playlist/abc'); rollback to s;
savepoint s; insert into public.profile_links (user_id, position, title, url) values ('00000000-0000-0000-0000-00000000000b', 1, 'Mix', 'https://open.spotify.com/playlist/abc'); rollback to s;

\echo '== 22 stats: B show_stats on, ghost off: A sees B top tracks (expect 1 row, plays 2)'
select title, plays from public.profile_top_tracks('00000000-0000-0000-0000-00000000000b');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 23 B turns show_stats off (UPDATE 1); B still sees own (expect 1)'
with u as (update public.profiles set show_stats = false where id='00000000-0000-0000-0000-00000000000b' returning 1) select count(*) as updated from u;
select count(*) from public.profile_top_tracks('00000000-0000-0000-0000-00000000000b');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
\echo '== 24 show_stats off: A sees 0 tracks and 0 artists'
select count(*) from public.profile_top_tracks('00000000-0000-0000-0000-00000000000b');
select count(*) from public.profile_top_artists('00000000-0000-0000-0000-00000000000b');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 25 B show_stats back on + ghost on (UPDATE 1, UPDATE 1); B still sees own (expect 1)'
with u as (update public.profiles set show_stats = true where id='00000000-0000-0000-0000-00000000000b' returning 1) select count(*) as updated from u;
with u as (update public.user_settings set ghost_mode = true where user_id='00000000-0000-0000-0000-00000000000b' returning 1) select count(*) as updated from u;
select count(*) from public.profile_top_tracks('00000000-0000-0000-0000-00000000000b');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
\echo '== 26 B ghost: A sees 0 tracks and 0 artists'
select count(*) from public.profile_top_tracks('00000000-0000-0000-0000-00000000000b');
select count(*) from public.profile_top_artists('00000000-0000-0000-0000-00000000000b');

\echo '== 27 storage: A uploads into own folder (no error), into B folder (ERROR), outside any folder (ERROR)'
-- No RETURNING here: the upload policy is insert-only, and RETURNING would also need a
-- read policy. Success shows as no error; step 30 checks what actually landed.
insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-00000000000a/x.jpg');
savepoint s; insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-00000000000b/x.jpg'); rollback to s;
savepoint s; insert into storage.objects (bucket_id, name) values ('avatars', 'x.jpg'); rollback to s;
reset role;
insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-00000000000b/y.jpg');
set local role authenticated;
-- storage.protect_delete refuses direct SQL deletes unless this flag is set (the storage
-- API sets it). Setting it here means any 0 below comes from the row policies, not that guard.
select set_config('storage.allow_delete_query', 'true', true) is not null as delete_guard_off;
\echo '== 28 storage: A moves own file into B folder (ERROR, or 0 if A cannot see the row; never 1), A deletes B file (expect 0)'
savepoint s; with u as (update storage.objects set name = '00000000-0000-0000-0000-00000000000b/z.jpg' where name = '00000000-0000-0000-0000-00000000000a/x.jpg' returning 1) select count(*) as moved from u; rollback to s;
with d as (delete from storage.objects where bucket_id = 'avatars' and name = '00000000-0000-0000-0000-00000000000b/y.jpg' returning 1) select count(*) as deleted from d;
-- Postgres only lets DELETE/UPDATE touch rows the user can also SELECT, which is why the
-- migration has a "see own avatar files" policy. Without it this step prints 0 and old
-- photos could never be removed (this test caught exactly that).
\echo '== 29 storage: A deletes own file (expect 1; the app removes the old photo this way)'
savepoint s; with d as (delete from storage.objects where bucket_id = 'avatars' and name = '00000000-0000-0000-0000-00000000000a/x.jpg' returning 1) select count(*) as deleted from d; rollback to s;
reset role;
\echo '== 30 storage as owner: avatars files of A and B (expect A/x.jpg and B/y.jpg only)'
select name from storage.objects where bucket_id = 'avatars' and name like '00000000-0000-0000-0000-00000000000_/%' order by name;
set local role anon;
\echo '== 31 anon: profile_favorites (ERROR), profile_links (ERROR), profile_top_tracks (ERROR), profile_top_artists (ERROR)'
savepoint s; select count(*) from public.profile_favorites; rollback to s;
savepoint s; select count(*) from public.profile_links; rollback to s;
savepoint s; select * from public.profile_top_tracks('00000000-0000-0000-0000-00000000000b'); rollback to s;
savepoint s; select * from public.profile_top_artists('00000000-0000-0000-0000-00000000000b'); rollback to s;
rollback;
