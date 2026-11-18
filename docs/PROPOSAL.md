# TunedIn: Engineering Proposal & MVP Plan

Status: **Draft, decisions A–G settled 2026-11-18** (see section 7). Launch: **NYU** (all schools).

---

## 1. What we're building

**"Find My for music."** Open the app and see what your friends nearby are listening to right
now, plus campus charts and leaderboards so the map isn't empty on day one.

- Free, open source, built in public on GitHub. Goal is users, not revenue.
- Launch on one campus first (BeReal/Gas playbook), then spread campus by campus.
- Every result (your top song, your dorm's #1, a leaderboard rank) is a shareable card.
- Out of scope: party/room queue mode (too close to Spotify Jam).

## 2. Core user flows

1. **Sign up (under 60s):** enter @nyu.edu email, get code, pick your school (Tandon, CAS, Steinhardt, Stern, ...) and a handle. Connect Last.fm username
   (or skip and check in songs manually). Prompt for location last, with a clear "why".
2. **Map:** friends shown as avatars on a coarse ~1km area ("near MetroTech"), with the current track,
   album art, and a 30s preview. Tap for "open in Spotify / Apple Music".
3. **Charts:** top songs/artists this week for NYU overall and for each school, school vs school
   (Tandon vs CAS vs Steinhardt), top listeners. Visible without any friends, so day-one users get value.
4. **Check in a song:** search, pick a track, it becomes your "now playing" for 30 minutes. Works
   for anyone, no Last.fm required.
5. **Share:** every chart, rank, and "now playing" has a share button producing an image card
   and a link that opens a public preview page and a "join your campus" CTA.
6. **Friends:** add via handle, share link, or contacts-free QR. Friends-only by default.

## 3. Feature scope

| v1 (launch on one campus) | Later |
|---|---|
| Email-code auth with school domain | More campuses, city charts |
| Last.fm connection + manual check-in | Native app (background updates, widgets) |
| Friends map with coarse ~1km areas | Reactions/comments on a friend's song |
| NYU + per-school charts, school vs school, top listeners | Streaks, weekly "Wrapped"-style recap |
| Share cards (OG images) + public share pages | Push notifications ("3 friends are on Espresso") |
| Ghost mode, friends-only visibility | Apple Music via MusicKit, ListenBrainz |
| Basic moderation (report, block) | Spotify OAuth if we ever get extended quota |

## 4. Data sources (verified 2026-11-18)

| Need | Source | Notes |
|---|---|---|
| Now playing / recent plays | **Last.fm `user.getRecentTracks`** | Public profiles readable with just an API key; current track flagged `nowplaying`. No published numeric rate limit, but excessive calls (several/sec) can get the key suspended, so we poll politely. ToS is non-commercial by default with attribution required, which fits a free app. Users scrobble from Spotify via Last.fm's built-in Spotify connection. |
| Track metadata, art, 30s previews | **Deezer Search API** | No key needed, returns ISRC and preview MP3 (checked live). |
| Fallback metadata / Apple Music links | **iTunes Search API** | No key, roughly 20 calls/min, so cache aggressively. |
| Search + "open in Spotify" links | **Spotify client credentials** | No user login, no user cap. Feb 2026 dev mode changes cut endpoints for some apps, so **verify search still works for our app before relying on it**; Deezer search is the fallback. |
| Listening data from Spotify directly | **Not used** | Dev mode is capped (5 users from Feb 2026, raised to 25 in July 2026) and extended quota is limited to established organizations. |

Sources: [Spotify Feb 2026 migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide),
[Spotify July 2026 quota update](https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates),
[Last.fm user.getRecentTracks](https://www.last.fm/api/show/user.getRecentTracks).

**Risk:** Last.fm is the single point of failure for passive data. Mitigations: manual check-in
always works, source adapters behind one interface so ListenBrainz/Apple Music can slot in.

## 5. Privacy & location

Principle: the app knows *roughly where* you are (a ~1km cell), never your coordinates, and only friends see it.

- **Opt-in, foreground only.** Location is read when the app is open; no background tracking.
- **Snap on device:** the browser gets a GPS fix, rounds it to a ~1km cell (geohash precision 6),
  and **only the cell id is sent** to the server. No polygons to draw.
- **Grouping for charts is by school, not location:** your school comes from signup, so charts
  never depend on where you are.
- **No location history.** One `presence` row per user, overwritten, expires after 30 min.
- **Friends-only** map. Charts are aggregate and only shown for schools with ≥5 listeners
  (so a chart can't reveal one person).
- **Ghost mode** one tap away; also "share music, hide location".
- Note in onboarding that Last.fm profiles are public on Last.fm itself.

## 6. Architecture

```
 Browser (Next.js PWA)
   │  pages, map, share pages, OG images
   ▼
 Next.js on Vercel ── route handlers /api/* ──► Supabase Postgres (+ PostGIS, RLS)
                                                   ▲
 Supabase scheduled Edge Function (every 1–2 min) ─┘
   polls Last.fm for active users → writes plays + presence
   enriches new tracks via Deezer / iTunes (cached in `tracks`)
 Nightly/hourly SQL job → refreshes chart materialized views
```

### Suggested stack (with tradeoffs)

| Layer | Recommendation | Why / alternative |
|---|---|---|
| App | **Keep Next.js 15 + Tailwind, ship as a PWA** | Fastest to iterate, links open instantly (viral), one codebase. Native (Expo) is better for background location and widgets, but adds app store friction. See Decision A. |
| DB + auth + realtime | **Supabase** (Postgres, PostGIS, row-level security, email OTP, realtime) | Free tier, open source, SQL for charts. Firebase is the alternative but charts/leaderboards are much harder in Firestore. |
| Background polling | **Supabase cron + Edge Function** | Vercel's free tier only allows daily cron. Alternative: a small worker on Fly/Railway. |
| Map | **MapLibre GL + OpenFreeMap tiles** | No API key or billing, open source. Mapbox looks nicer but needs a key and has usage pricing. |
| Share cards | **`next/og` ImageResponse** | Built into Next.js, renders cards at the edge. |
| Hosting | Vercel (free) | Zero config for Next.js. |

### Data model (first pass)

- `universities(id, name, email_domain)`  (NYU, nyu.edu)
- `schools(id, university_id, name, slug)`  (Tandon, CAS, Steinhardt, Stern, Tisch, ...)
- `users(id, handle, school_id, avatar_url, lastfm_username, ghost_mode, created_at)`
- `friendships(user_a, user_b, status[pending|accepted|blocked], created_at)`
- `tracks(id, isrc, title, artist, album, artwork_url, preview_url, deezer_id, spotify_id, itunes_id)`
- `plays(id, user_id, track_id, played_at, source[lastfm|checkin])`  (no location stored)
- `presence(user_id PK, geo_cell, track_id, updated_at, expires_at)`
- `chart_weekly_*` materialized views (university, school, top listeners)

RLS: you can read your own rows, your accepted friends' `presence`, and the public chart views.

### Polling strategy

Only poll users who opened the app in the last ~12h, or whose friends are viewing the map.
Cadence: every 1–2 min for active users, backing off to 10 min. At 1,000 active users that's
roughly 10 req/s at the fastest cadence, which is near Last.fm's "be reasonable" line, so we
batch, stagger, and back off on error 29. Revisit before going beyond NYU.

### Repo layout

```
TunedIn_App/
  docs/                 PROPOSAL.md, decisions log
  app/                  (renamed from tunedin_app/)
    src/app/            routes: /, /map, /charts/[school], /u/[handle], /s/[id] (share), /api/*
    src/lib/sources/    lastfm.ts, deezer.ts, itunes.ts, spotify.ts  (one MusicSource interface)
    src/lib/geo/        ~1km cell rounding (client side)
    src/components/
  supabase/
    migrations/         SQL schema, RLS policies, chart views
    functions/poll-lastfm/
```

### What to keep / remove from the current repo

- **Keep:** Next.js 15 + Tailwind 4 + TypeScript scaffold, `.env.local` (already gitignored).
- **Remove:** `api/login`, `api/callback`, `dashboard/`. The flow is broken (redirect URI typo,
  `localhost` no longer accepted by Spotify), and it passes the access token in the URL, which
  is a security problem. We don't need user-level Spotify at all now.
- **Reuse:** the Spotify client id/secret, for client-credentials search only.
- Before going public: `.env.local` has never been committed (checked git history), but add a
  `.env.example`, LICENSE, and a README that explains the project.

## 7. Decisions (settled 2026-11-18)

| | Decision | Choice |
|---|---|---|
| A | PWA vs native | **PWA first** |
| B | Backend | **Supabase** |
| C | Sign-up | **@nyu.edu email code**, user picks their school |
| D | Location / grouping | **Group by NYU school** (Tandon, CAS, Steinhardt, ...) for charts and leaderboards; map uses coarse ~1km cells, no zone drawing |
| E | Repo shape | **Single app, rename `tunedin_app/` to `app/`** |
| F | Launch campus | **NYU** (all schools) |
| G | License | **MIT** |

Caveat on C/D: every NYU school shares the nyu.edu domain, so the email proves "NYU student" but
not which school. School is self-reported at signup. Fine for launch; revisit if people game
school-vs-school leaderboards.

## 8. Build order

1. **Cleanup:** remove Spotify OAuth, add README/LICENSE/.env.example, set up Supabase + schema.
2. **Auth + profile:** @nyu.edu email code, handle, pick school.
3. **Sources:** Last.fm adapter + Deezer enrichment, manual check-in. Verify Spotify search.
4. **Polling job:** Edge Function writing `plays` + `presence`.
5. **Charts:** materialized views + charts pages (works with zero friends).
6. **Share cards:** OG images and public share pages for charts and now playing.
7. **Friends + map:** friend requests, ~1km cells, MapLibre map, ghost mode.
8. **Launch prep:** seed with 20–50 friends across a few NYU schools, moderation basics.

Rationale for charts before map: charts work with one user, so early testers see value and share
it, which brings in the friends the map needs.
