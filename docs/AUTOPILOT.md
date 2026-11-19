# Autopilot: plays from streaming services

TunedIn is a social layer on top of the music people already stream. It does not play
music. Plays reach it in two ways:

1. **Automatically, through Last.fm.** A person links Spotify (or another player) to a free
   Last.fm account once. Last.fm then records everything they play, and TunedIn reads that
   public history. This is the path that works for a whole campus, because Spotify's own API
   limits new apps to 25 users.
2. **By hand.** Tapping a song in the app ("check-in"). The fallback for people with nothing
   connected.

## How the reader works

`app/src/lib/lastfm-sync.ts` pulls one person's new plays:

1. Ask Last.fm for plays since the newest one already imported (the cursor).
2. Match each song to the track list (`resolveTrack`, cached per spelling).
3. Record the plays and move the cursor forward.
4. Set their "now playing" from what Last.fm says is on, or from their latest play today.

Running it twice imports nothing twice: a play is unique per person, song and time.

It is triggered in two places:

| Trigger | Where | What it refreshes |
|---|---|---|
| Someone opens Home or the Map | `POST /api/lastfm/sync` | Their own plays, then up to 5 friends whose data is stale |
| Every minute | `GET /api/cron/lastfm` | The 12 connected people whose data is oldest |

The first trigger alone keeps the app working. The second keeps charts and the map fresh
when nobody happens to be looking.

## Turning on the schedule (one-time setup)

The schedule runs inside the Supabase database and calls the deployed app.

1. **Make a secret.** In a terminal: `openssl rand -hex 32`. Keep the output handy.
2. **Give it to the app.** In Vercel, Project Settings, Environment Variables, add
   `CRON_SECRET` with that value, then redeploy.
3. **Create the schedule.** In the Supabase dashboard, open the SQL Editor and run this,
   with your secret in place of `YOUR_SECRET`:

   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;

   select cron.schedule(
     'tunedin-lastfm',
     '* * * * *',
     $$
     select net.http_get(
       url := 'https://tuned-in-app.vercel.app/api/cron/lastfm',
       headers := jsonb_build_object('Authorization', 'Bearer YOUR_SECRET'),
       timeout_milliseconds := 55000
     );
     $$
   );
   ```

To check it is running: `select * from cron.job_run_details order by start_time desc limit 5;`
To stop it: `select cron.unschedule('tunedin-lastfm');`

The secret lives only in Vercel and in that one scheduled job. It is not in the repo.

## Limits to know about

- **Politeness to Last.fm.** One request per person per run, a short pause between people,
  and nobody is re-checked within 45 seconds. Last.fm publishes no hard number, but asks
  apps not to make several calls a second.
- **Capacity.** 12 people every minute is 720 an hour. With more connected people than
  that, each person is refreshed less often by the schedule, though opening the app still
  refreshes them at once. Raise `USERS_PER_RUN` or shorten the schedule when it matters.
- **First connection.** The first import looks back 7 days and takes a few runs to finish,
  because matching new songs takes time.
- **Private Last.fm profiles** cannot be read. The setting shows that state so the person
  can change it on Last.fm.
