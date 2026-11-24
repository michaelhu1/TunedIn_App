# Apple Music

People on Apple Music connect with one button and their plays arrive by themselves, the same
way Spotify plays arrive through Last.fm. Until the three keys below are set, the button is
hidden and nothing else in the app changes.

## One-time setup (about 10 minutes)

You need a paid Apple Developer Program membership. Everything happens at
[developer.apple.com/account](https://developer.apple.com/account).

### 1. Create a Media ID

1. Open **Certificates, Identifiers & Profiles**, then **Identifiers**.
2. Press **+**. Choose **Media IDs** and press Continue.
3. Description: `TunedIn`. Identifier: `media.app.tunedin` (any reverse-domain name that
   starts with `media.` works; it is never shown to anyone).
4. Tick **MusicKit**, press Continue, then Register.

### 2. Create a MusicKit key

1. In the same area open **Keys** and press **+**.
2. Key Name: `TunedIn MusicKit`.
3. Tick **Media Services (MusicKit, ShazamKit, Apple Music Feed)** and press **Configure**.
   Pick the Media ID from step 1 and Save.
4. Press Continue, then Register.
5. Press **Download**. You get a file named `AuthKey_XXXXXXXXXX.p8`. **Apple lets you download
   it once.** Keep it somewhere safe and never commit it.
6. Note the **Key ID** shown on that page (10 characters; it is also the `XXXXXXXXXX` in the
   file name).

### 3. Find your Team ID

Open **Membership details** on the account home page. The **Team ID** is 10 characters.

### 4. Give the three values to the app

In Vercel: Project Settings, Environment Variables. Add these for Production (and Preview if
you want it there), then redeploy.

| Name | Value |
|---|---|
| `APPLE_MUSIC_TEAM_ID` | The Team ID from step 3 |
| `APPLE_MUSIC_KEY_ID` | The Key ID from step 2 |
| `APPLE_MUSIC_PRIVATE_KEY` | The whole contents of the `.p8` file, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines. Open it in a text editor and paste. |

For local development put the same three in `app/.env.local`. A multi-line value there needs
double quotes around it, or write it on one line with `\n` where the line breaks were.

### 5. Apply the database change

`supabase db push` (or however you normally apply `supabase/migrations`). The migration is
`20261124230000_apple_music.sql`.

### Check it works

Open **Connect your music** in the app. An Apple Music card with a **Connect Apple Music**
button should be there. Press it, sign in with an Apple ID that has an Apple Music
subscription, approve, and the card should say "Apple Music connected". Play a song on Apple
Music; it should appear on Home within a minute or two.

If the button stays on "Getting ready..." or shows an error, the server log will say whether
the key could not be read. The usual cause is a private key that lost its line breaks or its
BEGIN/END lines when pasted.

No change to the schedule in [AUTOPILOT.md](AUTOPILOT.md) is needed: the same job that reads
Last.fm now reads Apple Music too.

## How it works

1. **Connecting.** The button loads Apple's MusicKit JS and opens Apple's sign-in window. When
   the person approves, Apple returns a *Music User Token*. The browser sends it to
   `POST /api/apple-music`, which checks it works and stores it in `apple_music_links`, a
   table no browser can read. The token is a credential, so even its owner cannot read it back.
2. **Reading.** `app/src/lib/apple-music-sync.ts` asks Apple for the person's "recently
   played tracks" and compares the list with the one from last time. Whatever is new at the
   top is recorded as plays, through the same song-matching as every other source.
3. **Two tokens.** Apple wants a *developer token* (identifies TunedIn; signed on the server
   from the three values above, see `apple-music-token.ts`) and the *Music User Token*
   (identifies the listener's permission).

One automatic source per person: connecting Apple Music disconnects Last.fm and the other
way round, so someone who also sends Apple Music plays to Last.fm is not counted twice.

## Limits to know about

- **Apple gives no play times.** Its list says what was played, in order, but not when. Each
  play is dated by estimate: with a look every minute or so, that is accurate to about a
  minute. If someone was not checked for hours (they had not opened the app in two weeks, so
  the schedule skipped them), their plays in between are spread evenly across the gap.
- **No history on connecting.** The first look only remembers the list. Plays count from
  the moment of connecting, not the 7 days back that Last.fm offers.
- **At most 30 songs between looks.** Apple's list is 30 long. More than 30 plays between
  two looks and the oldest are missed. Not reachable with a look every minute.
- **Replaying a song that is still on the list** may not register, depending on whether Apple
  lists it a second time. A song on repeat counts at least once, which is all the charts use
  (one per person per song per day), but personal play counts can come out low.
- **No "playing right now".** Apple's web API has no such signal. The newest play is shown
  as current, so the green dot can lag by up to a minute or so, and it is not known whether
  Apple lists a song when it starts or when it ends.
- **Tokens run out.** A Music User Token lasts roughly six months, and stops working if the
  person removes TunedIn under their Apple account or their subscription ends. Settings then
  says so and offers "Connect Apple Music again".
- **Needs a subscription.** Apple only returns listening data for Apple Music subscribers.
- **Installed web app on iPhone.** Apple's sign-in opens a separate window. That is reliable
  in Safari; inside the home-screen version of a web app it is less predictable. Test it
  there first.

## For the native app

Nothing here is tied to the website. The server stores the token and does the reading, so a
native shell only has to obtain a Music User Token and send it:

- On iOS, MusicKit (`MusicUserTokenProvider`, or `SKCloudServiceController.requestUserToken`)
  returns the same kind of token. It needs a developer token to ask with: either enable the
  **MusicKit** app service on the App ID so Apple makes one automatically, or fetch ours from
  `GET /api/apple-music/token`.
- Send it to `POST /api/apple-music` with `{ "musicUserToken": "..." }`, signed in as the
  person. Sending `null` disconnects.
- A native app can also see what is playing at this moment (`MPMusicPlayerController.systemMusicPlayer`),
  which the web cannot. That would be a small new endpoint that reports the current song
  directly, removing the "no playing right now" and timing limits above.
