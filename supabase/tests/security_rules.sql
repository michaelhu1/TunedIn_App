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
rollback;
