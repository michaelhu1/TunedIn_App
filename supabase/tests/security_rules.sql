-- Security rules test. Acts as different users and tries to break the rules in
-- supabase/migrations. Every step says what it expects; the whole thing runs in one
-- transaction and rolls back, so it leaves no data behind.
--
-- If you ever see "current transaction is aborted" in the output, a setup statement failed
-- and every step after it is meaningless: fix that first.
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
insert into public.tracks (id,title,artist) values ('00000000-0000-0000-0000-0000000000aa','Security Test Song','Security Test Artist');  -- made-up names, so this never collides with real songs in the database
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
-- ---------------------------------------------------------------------------
-- Connection fields, concerts and taste match (20261119160000_profile_connection.sql)
-- ---------------------------------------------------------------------------
reset role;
update public.user_settings set ghost_mode = false where user_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
update public.profiles set show_stats = true where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
-- A and B both play artists X1 and X2; A also plays X3, B also plays X4. C plays nothing.
insert into public.tracks (id, title, artist) values
  ('00000000-0000-0000-0000-0000000000c1','Security Test t1','Sec Test X1'), ('00000000-0000-0000-0000-0000000000c2','Security Test t2','Sec Test X2'),
  ('00000000-0000-0000-0000-0000000000c3','Security Test t3','Sec Test X3'), ('00000000-0000-0000-0000-0000000000c4','Security Test t4','Sec Test X4');
insert into public.plays (user_id, track_id, played_at, source) values
  ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000c1', now() - interval '1 hour','checkin'),
  ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000c2', now() - interval '2 hour','checkin'),
  ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000c3', now() - interval '3 hour','checkin'),
  ('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000c1', now() - interval '1 hour','checkin'),
  ('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000c2', now() - interval '2 hour','checkin'),
  ('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000c4', now() - interval '3 hour','checkin');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
\echo '== 32 A edits own profile: genre not on the list (ERROR), 4 genres (ERROR), prompt answer without a prompt (ERROR), instagram with a slash (ERROR), unknown badge (ERROR)'
savepoint s; update public.profiles set genres = array['pop','made-up-genre'] where id = '00000000-0000-0000-0000-00000000000a'; rollback to s;
savepoint s; update public.profiles set genres = array['pop','rock','jazz','soul'] where id = '00000000-0000-0000-0000-00000000000a'; rollback to s;
savepoint s; update public.profiles set prompt_answer = 'orphan answer' where id = '00000000-0000-0000-0000-00000000000a'; rollback to s;
savepoint s; update public.profiles set instagram = 'evil.example/x' where id = '00000000-0000-0000-0000-00000000000a'; rollback to s;
savepoint s; update public.profiles set student_status = 'professor' where id = '00000000-0000-0000-0000-00000000000a'; rollback to s;
\echo '== 33 A saves valid connection fields (expect 1)'
with u as (update public.profiles set pronouns = 'she/her', major = 'Music Tech', hometown = 'Queens', instagram = 'a.listener_1',
  student_status = 'transfer', prompt_key = 'ask_me', prompt_answer = 'my vinyl haul', genres = array['pop','jazz'],
  open_to = array['concert_buddies'], music_roles = array['bass'], music_note = 'looking for a drummer'
  where id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*) as saved from u;
\echo '== 34 concerts: A adds own (1), adds one for B (ERROR), bad status (ERROR), 7th position (ERROR); B reads A concert (1), B deletes it (0)'
with i as (insert into public.profile_concerts (user_id, position, status, artist) values ('00000000-0000-0000-0000-00000000000a', 1, 'going', 'X1') returning 1) select count(*) as added from i;
savepoint s; insert into public.profile_concerts (user_id, position, status, artist) values ('00000000-0000-0000-0000-00000000000b', 1, 'going', 'X1'); rollback to s;
savepoint s; insert into public.profile_concerts (user_id, position, status, artist) values ('00000000-0000-0000-0000-00000000000a', 2, 'maybe', 'X1'); rollback to s;
savepoint s; insert into public.profile_concerts (user_id, position, status, artist) values ('00000000-0000-0000-0000-00000000000a', 7, 'went', 'X1'); rollback to s;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select count(*) as b_reads_a_concert from public.profile_concerts where user_id = '00000000-0000-0000-0000-00000000000a';
with d as (delete from public.profile_concerts where user_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*) as b_deleted from d;

\echo '== 35 taste match, B looking at A: expect a score between 1 and 99 with shared artists Sec Test X1 and X2 (2 shared)'
select score between 1 and 99 as plausible_score, shared_artists, shared_count from public.taste_match('00000000-0000-0000-0000-00000000000a');
\echo '== 36 taste match with yourself (0 rows) and with C, who has no plays (0 rows)'
select count(*) as self_rows from public.taste_match('00000000-0000-0000-0000-00000000000b');
select count(*) as no_data_rows from public.taste_match('00000000-0000-0000-0000-00000000000c');
reset role;
update public.profiles set show_stats = false where id = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 37 A hides stats: B gets no taste match (0 rows), so a match never leaks hidden listening'
select count(*) as rows_when_hidden from public.taste_match('00000000-0000-0000-0000-00000000000a');
reset role;
update public.profiles set show_stats = true where id = '00000000-0000-0000-0000-00000000000a';
update public.user_settings set ghost_mode = true where user_id = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 38 A in ghost mode: B gets no taste match (0 rows)'
select count(*) as rows_when_ghost from public.taste_match('00000000-0000-0000-0000-00000000000a');
set local role anon;
\echo '== 39 anon: profile_concerts (ERROR), taste_match (ERROR)'
savepoint s; select count(*) from public.profile_concerts; rollback to s;
savepoint s; select * from public.taste_match('00000000-0000-0000-0000-00000000000a'); rollback to s;
-- ---------------------------------------------------------------------------
-- Report and block (20261119170000_report_and_block.sql)
-- ---------------------------------------------------------------------------
reset role;
update public.user_settings set ghost_mode = false where user_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
update public.profiles set show_stats = true where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
delete from public.friendships where '00000000-0000-0000-0000-00000000000a' in (requester_id, addressee_id);
insert into public.friendships (requester_id, addressee_id, status, accepted_at) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'accepted', now());

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
\echo '== 40 A blocks B (1); A blocks on behalf of B (ERROR); A blocks self (ERROR)'
with x as (insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b') returning 1) select count(*) as blocked from x;
savepoint s; insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c'); rollback to s;
savepoint s; insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a'); rollback to s;
\echo '== 41 A after blocking: B profile (0), own block list shows bob (1 row), friend request to B (ERROR)'
select count(*) as a_sees_b from public.profiles where id = '00000000-0000-0000-0000-00000000000b';
select handle from public.my_blocks();
savepoint s; insert into public.friendships (requester_id, addressee_id) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'); rollback to s;
reset role;
\echo '== 42 the A-B friendship was removed by the block (expect 0)'
select count(*) as friendships_left from public.friendships where '00000000-0000-0000-0000-00000000000a' in (requester_id, addressee_id) and '00000000-0000-0000-0000-00000000000b' in (requester_id, addressee_id);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 43 B, the blocked person: A profile (0), blocks visible (0), my_blocks (0), A concerts (0), A top tracks (0), taste match (0)'
select count(*) as b_sees_a from public.profiles where id = '00000000-0000-0000-0000-00000000000a';
select count(*) as blocks_visible from public.blocks;
select count(*) as my_blocks_rows from public.my_blocks();
select count(*) as a_concerts from public.profile_concerts where user_id = '00000000-0000-0000-0000-00000000000a';
select count(*) as a_top_tracks from public.profile_top_tracks('00000000-0000-0000-0000-00000000000a');
select count(*) as match_rows from public.taste_match('00000000-0000-0000-0000-00000000000a');
\echo '== 44 B sends A a friend request (ERROR); B removes the block A made (0)'
savepoint s; insert into public.friendships (requester_id, addressee_id) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a'); rollback to s;
with x as (delete from public.blocks where blocker_id = '00000000-0000-0000-0000-00000000000a' returning 1) select count(*) as removed from x;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
\echo '== 45 C, uninvolved: still sees both A and B (2)'
select count(*) as c_sees from public.profiles where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
\echo '== 46 A unblocks B (1); B can see A again (1)'
with x as (delete from public.blocks where blocker_id = '00000000-0000-0000-0000-00000000000a' and blocked_id = '00000000-0000-0000-0000-00000000000b' returning 1) select count(*) as unblocked from x;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select count(*) as b_sees_a_again from public.profiles where id = '00000000-0000-0000-0000-00000000000a';

\echo '== 47 B reports A (no error); reads reports (ERROR); reports as C (ERROR); second open report (ERROR); unknown reason (ERROR); reports self (ERROR)'
insert into public.reports (reporter_id, reported_user_id, reason, details) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', 'spam', 'test report');
savepoint s; select count(*) from public.reports; rollback to s;
savepoint s; insert into public.reports (reporter_id, reported_user_id, reason) values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 'spam'); rollback to s;
savepoint s; insert into public.reports (reporter_id, reported_user_id, reason) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', 'other'); rollback to s;
savepoint s; insert into public.reports (reporter_id, reported_user_id, reason) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', 'because'); rollback to s;
savepoint s; insert into public.reports (reporter_id, reported_user_id, reason) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'spam'); rollback to s;
\echo '== 48 B sets a status or snapshot on a report (ERROR: only four columns may be written)'
savepoint s; insert into public.reports (reporter_id, reported_user_id, reason, status) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', 'spam', 'dismissed'); rollback to s;
reset role;
\echo '== 49 as the database owner: the report exists with a snapshot of alice (expect alice | open)'
select snapshot->>'handle' as snapshot_handle, status from public.reports where reporter_id = '00000000-0000-0000-0000-00000000000b' and reported_user_id = '00000000-0000-0000-0000-00000000000a';
set local role anon;
\echo '== 50 anon: blocks (ERROR), reports (ERROR), my_blocks (ERROR)'
savepoint s; select count(*) from public.blocks; rollback to s;
savepoint s; insert into public.reports (reporter_id, reported_user_id, reason) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', 'spam'); rollback to s;
savepoint s; select * from public.my_blocks(); rollback to s;
-- ---------------------------------------------------------------------------
-- People you might click with (20261119180000_discover.sql)
-- B is the viewer throughout; the question each time is whether A is suggested to B.
-- ---------------------------------------------------------------------------
reset role;
delete from public.blocks where '00000000-0000-0000-0000-00000000000a' in (blocker_id, blocked_id);
delete from public.friendships where '00000000-0000-0000-0000-00000000000a' in (requester_id, addressee_id);
update public.user_settings set ghost_mode = false where user_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
update public.profiles set show_stats = true, open_to = '{}' where id = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 51 A has no "Open to" chip, so A is not suggested (0)'
select count(*) as suggested from public.people_you_might_click_with(50) where user_id = '00000000-0000-0000-0000-00000000000a';
reset role; update public.profiles set open_to = array['concert_buddies'] where id = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 52 A picks an "Open to" chip: suggested (1), with a taste score because A shows stats (t)'
select count(*) as suggested from public.people_you_might_click_with(50) where user_id = '00000000-0000-0000-0000-00000000000a';
select taste_score is not null as has_score from public.people_you_might_click_with(50) where user_id = '00000000-0000-0000-0000-00000000000a';
reset role; update public.profiles set show_stats = false where id = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 53 A hides stats: still suggested (1) but with no score and no shared artists (t)'
select count(*) as suggested from public.people_you_might_click_with(50) where user_id = '00000000-0000-0000-0000-00000000000a';
select taste_score is null and cardinality(shared_artists) = 0 as nothing_leaked from public.people_you_might_click_with(50) where user_id = '00000000-0000-0000-0000-00000000000a';
reset role; update public.user_settings set ghost_mode = true where user_id = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 54 A in ghost mode: not suggested (0)'
select count(*) as suggested from public.people_you_might_click_with(50) where user_id = '00000000-0000-0000-0000-00000000000a';
reset role; update public.user_settings set ghost_mode = false where user_id = '00000000-0000-0000-0000-00000000000a';
insert into public.friendships (requester_id, addressee_id) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 55 a pending friend request between them: not suggested (0)'
select count(*) as suggested from public.people_you_might_click_with(50) where user_id = '00000000-0000-0000-0000-00000000000a';
reset role; delete from public.friendships where '00000000-0000-0000-0000-00000000000a' in (requester_id, addressee_id);
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 56 A has blocked B: not suggested (0)'
select count(*) as suggested from public.people_you_might_click_with(50) where user_id = '00000000-0000-0000-0000-00000000000a';
\echo '== 57 B is never suggested to themselves (0)'
select count(*) as self_suggested from public.people_you_might_click_with(50) where user_id = '00000000-0000-0000-0000-00000000000b';
set local role anon;
\echo '== 58 anon: people_you_might_click_with (ERROR)'
savepoint s; select * from public.people_you_might_click_with(); rollback to s;
-- ---------------------------------------------------------------------------
-- Last.fm reader (20261119190000_lastfm_sync.sql)
-- ---------------------------------------------------------------------------
reset role;
update public.user_settings set lastfm_username = 'someone', lastfm_cursor = now(), lastfm_status = 'ok', lastfm_synced_at = now() where user_id = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
\echo '== 59 A cannot fake the reader: write the cursor (ERROR), write the status (ERROR), call set_presence_from_play (ERROR)'
savepoint s; update public.user_settings set lastfm_cursor = now() - interval '1 year' where user_id = '00000000-0000-0000-0000-00000000000a'; rollback to s;
savepoint s; update public.user_settings set lastfm_status = 'ok' where user_id = '00000000-0000-0000-0000-00000000000a'; rollback to s;
savepoint s; select public.set_presence_from_play('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000aa', now(), true); rollback to s;
\echo '== 60 A changes their Last.fm username: the import position is reset (expect t)'
update public.user_settings set lastfm_username = 'someone_else' where user_id = '00000000-0000-0000-0000-00000000000a';
reset role;
select lastfm_cursor is null and lastfm_status is null and lastfm_synced_at is null as reset_done from public.user_settings where user_id = '00000000-0000-0000-0000-00000000000a';
-- ---------------------------------------------------------------------------
-- Friends chart (20261119210000_friends_charts.sql). B is the viewer; A has plays.
-- ---------------------------------------------------------------------------
reset role;
delete from public.blocks where '00000000-0000-0000-0000-00000000000a' in (blocker_id, blocked_id);
delete from public.friendships where '00000000-0000-0000-0000-00000000000a' in (requester_id, addressee_id);
update public.user_settings set ghost_mode = false where user_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
update public.profiles set show_stats = true where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 61 not friends: B sees own plays in the friends chart but none of A (alice 0, bob > 0)'
select count(*) filter (where 'alice' = any(handles)) as rows_with_alice, count(*) filter (where 'bob' = any(handles)) as rows_with_bob from public.chart_friends_top_tracks(7, 50);
reset role; insert into public.friendships (requester_id, addressee_id, status, accepted_at) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'accepted', now());
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 62 friends: A now appears (alice > 0)'
select count(*) filter (where 'alice' = any(handles)) as rows_with_alice, count(*) filter (where 'bob' = any(handles)) as rows_with_bob from public.chart_friends_top_tracks(7, 50);
reset role; update public.profiles set show_stats = false where id = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 63 A hides stats: A drops out of the friends chart (alice 0)'
select count(*) filter (where 'alice' = any(handles)) as rows_with_alice, count(*) filter (where 'bob' = any(handles)) as rows_with_bob from public.chart_friends_top_tracks(7, 50);
reset role; update public.profiles set show_stats = true where id = '00000000-0000-0000-0000-00000000000a'; update public.user_settings set ghost_mode = true where user_id = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 64 A in ghost mode: still out (alice 0)'
select count(*) filter (where 'alice' = any(handles)) as rows_with_alice, count(*) filter (where 'bob' = any(handles)) as rows_with_bob from public.chart_friends_top_tracks(7, 50);
\echo '== 65 the raw listens function is not callable by members (ERROR)'
savepoint s; select * from public.chart_friends_listens(7); rollback to s;
set local role anon;
\echo '== 66 anon: chart_friends_top_tracks (ERROR)'
savepoint s; select * from public.chart_friends_top_tracks(); rollback to s;
-- ---------------------------------------------------------------------------
-- Public map (20261119220000_public_map.sql). Uses a made-up cell, 'zzzzz0', so real or
-- sample data in the database cannot affect the counts.
-- ---------------------------------------------------------------------------
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'd@nyu.edu'), ('00000000-0000-0000-0000-0000000000e2', 'e@nyu.edu');
insert into public.profiles (id, handle, university_id, school_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'sectest_d', gen_random_uuid(), current_setting('t.school')::uuid),
  ('00000000-0000-0000-0000-0000000000e2', 'sectest_e', gen_random_uuid(), current_setting('t.school')::uuid);
update public.user_settings set share_location = true, ghost_mode = false, count_me_nearby = true
  where user_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2');
delete from public.presence where user_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2');
-- Four people in the area with a song.
insert into public.presence (user_id, geo_cell, cell_at, track_id, updated_at, expires_at)
select u, 'zzzzz0', now(), '00000000-0000-0000-0000-0000000000aa', now(), now() + interval '2 hours'
from unnest(array['00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000e1']::uuid[]) u;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 67 four people in an area: not shown (areas 0)'
select count(*) as areas, coalesce(max(people), 0) as people from public.nearby_areas() where cell = 'zzzzz0';
reset role;
insert into public.presence (user_id, geo_cell, cell_at, track_id, updated_at, expires_at)
values ('00000000-0000-0000-0000-0000000000e2', 'zzzzz0', now(), '00000000-0000-0000-0000-0000000000aa', now(), now() + interval '2 hours');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 68 a fifth person arrives: shown (areas 1, people 5), marked as the viewer own area (t)'
select count(*) as areas, coalesce(max(people), 0) as people from public.nearby_areas() where cell = 'zzzzz0';
select my_area from public.nearby_areas() where cell = 'zzzzz0';
\echo '== 69 what comes back names nobody: the only fields are song details and a count'
select string_agg(distinct k, ', ' order by k) as fields_in_top_tracks
from public.nearby_areas() a, jsonb_array_elements(a.top_tracks) t, jsonb_object_keys(t) k where a.cell = 'zzzzz0';
\echo '== 70 E opts out of public totals themselves (1 row), and the area drops below the minimum (areas 0)'
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
with u as (update public.user_settings set count_me_nearby = false where user_id = '00000000-0000-0000-0000-0000000000e2' returning 1) select count(*) as changed from u;
select count(*) as areas, coalesce(max(people), 0) as people from public.nearby_areas() where cell = 'zzzzz0';
reset role; update public.user_settings set count_me_nearby = true where user_id = '00000000-0000-0000-0000-0000000000e2';
update public.user_settings set ghost_mode = true where user_id = '00000000-0000-0000-0000-0000000000e1';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 71 D goes ghost: not counted (areas 0)'
select count(*) as areas, coalesce(max(people), 0) as people from public.nearby_areas() where cell = 'zzzzz0';
reset role; update public.user_settings set ghost_mode = false where user_id = '00000000-0000-0000-0000-0000000000e1';
insert into public.presence (user_id, geo_cell, cell_at, track_id, updated_at, expires_at)
values ('00000000-0000-0000-0000-0000000000e1', 'zzzzz0', now() - interval '4 hours', '00000000-0000-0000-0000-0000000000aa', now(), now() + interval '2 hours')
on conflict (user_id) do update set geo_cell = excluded.geo_cell, cell_at = excluded.cell_at, track_id = excluded.track_id, expires_at = excluded.expires_at;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 72 D location is four hours old: not counted as here now (areas 0)'
select count(*) as areas, coalesce(max(people), 0) as people from public.nearby_areas() where cell = 'zzzzz0';
\echo '== 73 B cannot lower the minimum (ERROR) or write place names (ERROR)'
savepoint s; update public.app_settings set value = '1' where key = 'nearby_min_people'; rollback to s;
savepoint s; insert into public.places (cell, name) values ('zzzzz0', 'Fake Place'); rollback to s;
set local role anon;
\echo '== 74 anon: nearby_areas (ERROR)'
savepoint s; select * from public.nearby_areas(); rollback to s;
-- ---------------------------------------------------------------------------
-- Favourite artists (20261119230000_favorite_artists.sql)
-- ---------------------------------------------------------------------------
reset role;
delete from public.blocks where '00000000-0000-0000-0000-00000000000a' in (blocker_id, blocked_id);
delete from public.friendships where '00000000-0000-0000-0000-00000000000a' in (requester_id, addressee_id);
update public.user_settings set ghost_mode = false where user_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
update public.profiles set favorite_artists = array['Sec Artist One','Sec Artist Two'], open_to = array['new_friends'] where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set favorite_artists = array['sec artist one','Other'] where id = '00000000-0000-0000-0000-00000000000b';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 75 B writes own favourite artists directly (ERROR: the server sets them after checking the names)'
savepoint s; update public.profiles set favorite_artists = array['anything i like'] where id = '00000000-0000-0000-0000-00000000000b'; rollback to s;
\echo '== 76 suggestions report the shared favourite, ignoring upper and lower case (expect Sec Artist One)'
select shared_favorites from public.people_you_might_click_with(50) where user_id = '00000000-0000-0000-0000-00000000000a';
reset role;
\echo '== 77 more than five favourite artists cannot be stored (ERROR)'
savepoint s; update public.profiles set favorite_artists = array['1','2','3','4','5','6'] where id = '00000000-0000-0000-0000-00000000000a'; rollback to s;
-- ---------------------------------------------------------------------------
-- Admin numbers (20261120000000_admin_stats.sql)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 78 a signed-in member cannot read the admin numbers (ERROR), nor can anon (ERROR)'
savepoint s; select public.admin_stats(); rollback to s;
set local role anon;
savepoint s; select public.admin_stats(); rollback to s;
reset role;
\echo '== 79 the admin numbers contain totals only: no emails, handles or ids (expect f)'
select public.admin_stats()::text ~* '(@nyu\.edu|alice|bob|00000000-0000-0000-0000-00000000000a)' as leaks_identity;
-- ---------------------------------------------------------------------------
-- Tester feedback changes (20261120010000_tester_feedback.sql)
-- ---------------------------------------------------------------------------
reset role;
delete from public.blocks where '00000000-0000-0000-0000-00000000000a' in (blocker_id, blocked_id);
delete from public.friendships where '00000000-0000-0000-0000-00000000000a' in (requester_id, addressee_id);
insert into public.friendships (requester_id, addressee_id, status, accepted_at) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'accepted', now());
update public.user_settings set ghost_mode = false where user_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
update public.profiles set show_stats = true where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
delete from public.profile_links where user_id = '00000000-0000-0000-0000-00000000000b';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 80 five genres are accepted (1); six are refused (ERROR)'
with u as (update public.profiles set genres = array['pop','rock','jazz','soul','indie'] where id = '00000000-0000-0000-0000-00000000000b' returning 1) select count(*) as saved from u;
savepoint s; update public.profiles set genres = array['pop','rock','jazz','soul','indie','folk'] where id = '00000000-0000-0000-0000-00000000000b'; rollback to s;
\echo '== 81 B adds a playlist link (1) but cannot set its picture, on insert or later (ERROR, ERROR)'
with i as (insert into public.profile_links (user_id, position, title, url) values ('00000000-0000-0000-0000-00000000000b', 1, 'Mix', 'https://open.spotify.com/playlist/abc') returning 1) select count(*) as added from i;
savepoint s; insert into public.profile_links (user_id, position, title, url, image_url) values ('00000000-0000-0000-0000-00000000000b', 2, 'Mix 2', 'https://open.spotify.com/playlist/def', 'https://i.scdn.co/image/x'); rollback to s;
savepoint s; update public.profile_links set image_url = 'https://i.scdn.co/image/x' where user_id = '00000000-0000-0000-0000-00000000000b'; rollback to s;
reset role;
\echo '== 82 even the server cannot store a picture hosted somewhere unknown (ERROR)'
savepoint s; update public.profile_links set image_url = 'https://evil.example/pixel.gif' where user_id = '00000000-0000-0000-0000-00000000000b'; rollback to s;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 83 friends leaderboard: friend A is listed and B is marked as me (alice 1, me 1)'
select count(*) filter (where handle = 'alice') as alice_rows, count(*) filter (where is_me) as me_rows from public.chart_friends_top_listeners(7, 50);
reset role; update public.profiles set show_stats = false where id = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 84 A hides stats: A leaves the leaderboard (alice 0, me 1)'
select count(*) filter (where handle = 'alice') as alice_rows, count(*) filter (where is_me) as me_rows from public.chart_friends_top_listeners(7, 50);
set local role anon;
\echo '== 85 anon: chart_friends_top_listeners (ERROR)'
savepoint s; select * from public.chart_friends_top_listeners(); rollback to s;
reset role;
-- Friend moments and "felt this". A and B are friends; C is a stranger. A shows the test song today.
update public.profiles set show_stats = true where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
delete from public.song_reactions;
delete from public.plays where track_id = '00000000-0000-0000-0000-0000000000aa';
insert into public.presence (user_id, track_id, updated_at, expires_at) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000aa', now(), now() + interval '1 hour')
  on conflict (user_id) do update set track_id = excluded.track_id, updated_at = now(), expires_at = excluded.expires_at;
insert into public.plays (user_id, track_id, played_at, source) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000aa', now(), 'checkin'), ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000aa', now(), 'checkin'), ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000aa', now(), 'checkin');
update public.user_settings set ghost_mode = false where user_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 86 same song today: B sees friend A only, never stranger C (alice t, others 0)'
select coalesce(bool_or(friend_id = '00000000-0000-0000-0000-00000000000a'), false) as alice, count(*) filter (where friend_id <> '00000000-0000-0000-0000-00000000000a') as others from public.friend_same_songs_today();
\echo '== 87 B feels A song (t); a song A is not showing (f); stranger C cannot react to A (f)'
select public.felt_this('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000aa') as ok;
select public.felt_this('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1') as other_song;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select public.felt_this('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000aa') as stranger;
\echo '== 88 C cannot read the reaction between A and B (0); A, the receiver, can (1)'
select count(*) as visible_to_c from public.song_reactions;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select count(*) as visible_to_a from public.song_reactions;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 89 a reaction cannot be written or redirected directly (ERROR, ERROR)'
savepoint s; insert into public.song_reactions (sender_id, receiver_id, track_id, day) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000aa', current_date); rollback to s;
savepoint s; update public.song_reactions set receiver_id = '00000000-0000-0000-0000-00000000000c' where sender_id = '00000000-0000-0000-0000-00000000000b'; rollback to s;
reset role; update public.user_settings set ghost_mode = true where user_id = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 90 A goes ghost: no shared-song moment, no overlap row, and no new reaction (0, 0, f)'
select count(*) as same_songs from public.friend_same_songs_today();
select count(*) as overlap_rows from public.friend_overlap();
select public.felt_this('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000aa') as ok;
set local role anon;
\echo '== 91 anon: friend_same_songs_today, friend_overlap, felt_this (ERROR x3)'
savepoint s; select * from public.friend_same_songs_today(); rollback to s;
savepoint s; select * from public.friend_overlap(); rollback to s;
savepoint s; select public.felt_this('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000aa'); rollback to s;
reset role;
update public.user_settings set ghost_mode = false where user_id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
update public.profiles set show_stats = false where id = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 92 A hides stats: B gets no shared-song moment and no overlap number for A (0, 0)'
select count(*) as same_songs from public.friend_same_songs_today();
select count(*) as overlap_rows from public.friend_overlap();
reset role; update public.profiles set show_stats = true where id = '00000000-0000-0000-0000-00000000000a'; update public.user_settings set ghost_mode = true where user_id = '00000000-0000-0000-0000-00000000000b';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
\echo '== 93 B in ghost mode cannot send a reaction (f)'
select public.felt_this('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000aa') as ok;
reset role; update public.user_settings set ghost_mode = false where user_id = '00000000-0000-0000-0000-00000000000b';
delete from public.song_reactions;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select public.felt_this('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000aa') as sent;
reset role;
\echo '== 94 unfriending removes the reactions between the two (1 before, 0 after)'
select count(*) as before from public.song_reactions;
delete from public.friendships where '00000000-0000-0000-0000-00000000000a' in (requester_id, addressee_id) and '00000000-0000-0000-0000-00000000000b' in (requester_id, addressee_id);
select count(*) as after from public.song_reactions;
\echo '== 95 changing a playlist link address clears its old picture (t)'
delete from public.profile_links where user_id = '00000000-0000-0000-0000-00000000000b';
insert into public.profile_links (user_id, position, title, url, image_url) values ('00000000-0000-0000-0000-00000000000b', 1, 'Mix', 'https://open.spotify.com/playlist/abc', 'https://i.scdn.co/image/x');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
update public.profile_links set url = 'https://open.spotify.com/playlist/zzz' where user_id = '00000000-0000-0000-0000-00000000000b';
reset role;
select image_url is null as cleared from public.profile_links where user_id = '00000000-0000-0000-0000-00000000000b';
rollback;
