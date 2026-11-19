# TunedIn

[![CI](https://github.com/michaelhu1/TunedIn_App/actions/workflows/ci.yml/badge.svg)](https://github.com/michaelhu1/TunedIn_App/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**See what the people around you are listening to.** TunedIn is a campus music app: a feed and
map of what your friends are playing right now, what is playing around you, and live charts of
what your school has on repeat.
It is free, open source, and launching at NYU.

It is an installable web app (PWA), so it runs on any phone from a link with no app store.

## What it does

| | |
|---|---|
| **Your music, automatically** | Link Spotify to a free Last.fm account once and every play arrives by itself. TunedIn does not play music; it is a social layer on what you already stream. Songs can also be set by hand. |
| **Friends feed** | Home shows what each friend is playing today, with a green dot for listening now, 30-second previews and one tap to open the song in Spotify. |
| **Two maps** | *Friends*: each friend in a zone about 1 km wide, never an exact spot. *Public*: busy areas such as "12 listening around Washington Square" and the songs playing there, with nobody identified. |
| **Charts** | Top songs and artists for NYU, each school and your friends, plus a school-vs-school leaderboard. A public version at `/nyu` works without an account. |
| **Profiles and friend-making** | Photo, bio, prompt, genre tags, concerts and a taste match ("72%: you both play SZA"), and a list of people you might click with. |
| **Safety and control** | NYU-only sign-up by emailed code, block and report, ghost mode, a plain-language [privacy page](app/src/app/privacy/page.tsx), and account deletion that removes everything. |

## Design decisions worth reading

These are the parts that took thought. Each is enforced in the database, not just in the UI.

**Location that cannot be precise.** The phone rounds its GPS fix to a 6-character
[geohash](app/src/lib/geo/geohash.ts) cell (about 1.2 km × 0.6 km) and sends only that string.
A check constraint makes the column unable to hold anything finer. There is one row per
person, overwritten in place and cleared at the end of the day, so no location history exists.
Sharing is opt-in, friends-only, and wiped the instant someone turns on ghost mode.

**Charts that one person cannot move.** Each person counts once per song per day, however
many times they play it. A song climbs only when many different people play it. Schools are
ranked per member, so a large school does not win on size, and a chart stays locked until
five different people have contributed, so it never describes one or two people.

**Messy song names become one song.** "See You Again (feat. Kali Uchis)" from Last.fm and
"See You Again" from search must count as the same track. Each new spelling is matched once
against Deezer (with iTunes as a fallback), then remembered in an alias table, so the next
lookup of that spelling is a database hit instead of a network call.

**Users cannot forge the things that matter.** The browser talks to Postgres directly, limited
by row-level security: you can read your own data, accepted friends' status, and aggregate
charts. Plays, statuses and locations are written only by server code. The security rules are
covered by tests that act as different users and try to break them.

**Sources are swappable.** Listening data and song metadata sit behind
[two small interfaces](app/src/lib/sources/types.ts). Spotify's API caps new apps at 25 users,
so listening comes from manual check-in and Last.fm today; adding another source is one adapter.

The full reasoning, alternatives considered, and build order are in
[docs/PROPOSAL.md](docs/PROPOSAL.md).

Built with AI assistance; the product and design decisions are mine, and they are documented
in the proposal.

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 15, React 19, TypeScript, Tailwind 4 | One codebase for pages and API routes; ships as a PWA |
| Database and auth | Supabase (Postgres, row-level security, email codes) | SQL for charts, security rules next to the data |
| Map | MapLibre GL + OpenFreeMap tiles | Open source, no API key or usage billing |
| Song data | Deezer and iTunes search, Spotify search for links | No user login needed for any of them |
| Tests and CI | Vitest, GitHub Actions | Type-check, unit tests and a production build on every push |

```
 Phone (PWA)
   │  rounds GPS to a ~1 km cell on the device
   ▼
 Next.js ── /api/* (server only: check-in, location, previews) ──► Supabase Postgres
   │                                                                  row-level security
   └── reads as the signed-in user (own data, friends, charts) ──────►  chart functions
```

## Repo layout

```
app/                  the Next.js app
  src/app/            screens (home, map, charts, friends, me) and API routes
  src/lib/sources/    Last.fm, Deezer, iTunes, Spotify adapters behind shared interfaces
  src/lib/geo/        location rounding
supabase/
  migrations/         schema, security policies, chart functions (commented for reading)
  seed.sql            40 sample students for local development
docs/PROPOSAL.md      plan, decisions and tradeoffs
```

## Running locally

You need Node 22, Docker, and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
supabase start                 # local Postgres + auth; applies migrations and sample data
cd app
cp .env.example .env.local     # fill in the keys that `supabase start` printed
npm install
npm run dev                    # http://localhost:3000
```

Sign in with any made-up `@nyu.edu` address. Locally, the code lands in a test inbox at
http://127.0.0.1:54324 and no real email is sent. `npm test` runs the unit tests.

## Status

Live at [tuned-in-app.vercel.app](https://tuned-in-app.vercel.app). Working: everything in the table above.
Next: testing with a first group of NYU students, a review screen for reports, and Apple Music.

How plays are read from streaming services, and the scheduled job behind it, is described in
[docs/AUTOPILOT.md](docs/AUTOPILOT.md).

## Credits

Song details and previews from [Deezer](https://developers.deezer.com). Automatic listening data
from [Last.fm](https://www.last.fm). Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors, tiles by [OpenFreeMap](https://openfreemap.org). TunedIn is not affiliated with
NYU, Spotify, Deezer, Apple or Last.fm.

## License

[MIT](LICENSE)
