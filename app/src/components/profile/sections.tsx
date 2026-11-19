import type { FullProfile, ProfileConcert, TasteMatch } from "@/lib/profile";
import { MUSIC_ROLES, OPEN_TO, PROMPTS } from "@/lib/profile-options";
import Cover from "@/components/cover";
import OpenInSpotify from "@/components/open-in-spotify";
import PreviewButton from "@/components/preview-button";
import { formatConcertDate, groupConcerts, todayYmd } from "./concerts";
import { instagramUrl, knownGenres, labelFor, labelsFor } from "./labels";
import { serviceName } from "./service-name";
import { matchRead, sharedArtistsSentence, joinNames } from "./taste-match";

// The read-only blocks of a profile page. Each one is plain data in, markup out, so they
// are server components and ship no JavaScript (the play buttons inside are the exception).

const LIVE_MINUTES = 30; // same window the map uses for "live now"
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 text-xs uppercase tracking-wide opacity-60">{children}</h2>;
}

/** A row of non-interactive tags. A list, so screen readers announce how many there are. */
function Pills({ items, label }: { items: string[]; label: string }) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li key={item} className="rounded-full border border-foreground/20 px-3 py-1 text-sm">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function TasteMatchCard({ match }: { match: TasteMatch }) {
  const shared = sharedArtistsSentence(match.sharedArtists, match.sharedCount);
  return (
    <section aria-labelledby="taste-match-heading" className="rounded-xl border border-foreground/15 p-4">
      <h2 id="taste-match-heading" className="mb-1 text-xs uppercase tracking-wide opacity-60">
        Your taste match
      </h2>
      <p className="text-4xl font-bold tabular-nums">{match.score}%</p>
      <p className="mt-1 font-medium">{matchRead(match.score, match.sharedCount)}</p>
      {shared && <p className="mt-1 text-sm opacity-80">{shared}</p>}
      {/* <details> opens and closes without any JavaScript, so this stays a server component. */}
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer opacity-60">How is this worked out?</summary>
        <p className="mt-2 opacity-70">
          It compares the artists each of you played in the last 90 days, giving the ones you play most a bit more
          weight. It only appears when the other person chooses to show their listening stats.
        </p>
      </details>
    </section>
  );
}

export function OpenTo({ keys }: { keys: FullProfile["openTo"] }) {
  const labels = labelsFor(keys, OPEN_TO);
  if (labels.length === 0) return null;
  return (
    <section>
      <Heading>Open to</Heading>
      <Pills items={labels} label="Open to" />
    </section>
  );
}

export function Prompt({ prompt }: { prompt: NonNullable<FullProfile["prompt"]> }) {
  const label = labelFor(prompt.key, PROMPTS);
  if (!label) return null; // a prompt this version of the app does not know
  return (
    <section>
      {/* The prompt is the heading, so a screen reader hears the question before the answer. */}
      <h2 className="text-sm opacity-60">{label}</h2>
      <p className="mt-1 break-words text-xl font-semibold leading-snug">“{prompt.answer}”</p>
    </section>
  );
}

/** Favourite artists, with the ones the viewer also picked called out. */
export function FavoriteArtists({ artists, sharedWithViewer }: { artists: string[]; sharedWithViewer: string[] }) {
  if (artists.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <Heading>Favourite artists</Heading>
      <Pills items={artists} label="Favourite artists" />
      {sharedWithViewer.length > 0 && (
        <p className="text-sm opacity-80">You both like {joinNames(sharedWithViewer)}.</p>
      )}
    </section>
  );
}

export function TheirSound({ genres, roles, note }: { genres: string[]; roles: FullProfile["musicRoles"]; note: string | null }) {
  const genreTags = knownGenres(genres);
  const roleLabels = labelsFor(roles, MUSIC_ROLES);
  // The note explains the roles ("bass in a jazz trio"), so it only shows alongside them.
  if (genreTags.length === 0 && roleLabels.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <Heading>Their sound</Heading>
      {genreTags.length > 0 && <Pills items={genreTags} label="Genres" />}
      {roleLabels.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Makes music</h3>
          <Pills items={roleLabels} label="Makes music" />
          {note && <p className="break-words text-sm opacity-70">{note}</p>}
        </div>
      )}
    </section>
  );
}

export function Concerts({ concerts, isOwner }: { concerts: ProfileConcert[]; isOwner: boolean }) {
  // Server time at render, as "today in New York", so a show tonight still counts as upcoming.
  const today = todayYmd();
  const { going, went } = groupConcerts(concerts, today);
  if (going.length === 0 && went.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <Heading>Concerts</Heading>
      {going.length > 0 && (
        <ConcertGroup title="Going to" concerts={going} today={today}>
          {/* Just a nudge toward the friend button; there is no messaging here. */}
          {!isOwner && <p className="mt-1 text-xs opacity-60">Going too? Say hi.</p>}
        </ConcertGroup>
      )}
      {went.length > 0 && <ConcertGroup title="Went to" concerts={went} today={today} />}
    </section>
  );
}

function ConcertGroup({ title, concerts, today, children }: { title: string; concerts: ProfileConcert[]; today: string; children?: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-medium">{title}</h3>
      <ul className="flex flex-col">
        {concerts.map((c) => {
          const date = formatConcertDate(c.eventDate, today);
          return (
            <li key={c.position} className="flex items-baseline gap-3 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.artist}</span>
                {c.venue && <span className="block truncate text-sm opacity-70">{c.venue}</span>}
              </span>
              {date && (
                // dateTime gives machines the exact date; people read the friendly one.
                <time dateTime={c.eventDate!} className="whitespace-nowrap text-xs opacity-60">
                  {date}
                </time>
              )}
            </li>
          );
        })}
      </ul>
      {children}
    </div>
  );
}

export function Instagram({ handle }: { handle: string | null }) {
  const url = instagramUrl(handle);
  if (!url) return null;
  return (
    <section aria-label="Instagram">
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener" // same reasoning as the playlist links
        className="flex items-center gap-3 rounded-xl border border-foreground/15 px-4 py-3"
      >
        <span className="min-w-0 flex-1 truncate font-medium">@{handle} on Instagram</span>
        <span aria-hidden className="opacity-60">↗</span>
        <span className="sr-only">(opens Instagram in a new tab)</span>
      </a>
    </section>
  );
}

export function NowPlaying({ track }: { track: NonNullable<FullProfile["nowPlaying"]> }) {
  // Server time at render. The page is rendered per request (it reads cookies), so this is fresh.
  const live = Date.now() - new Date(track.updatedAt).getTime() < LIVE_MINUTES * 60_000;
  return (
    <section aria-label="Now playing" className="rounded-xl border border-foreground/15 p-4">
      <p className="mb-2 text-xs uppercase tracking-wide opacity-60">
        {live ? <><span className="text-live" aria-hidden>●</span> Live now</> : "Earlier today"}
      </p>
      <div className="flex items-center gap-3">
        <Cover src={track.artworkUrl} size={56} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{track.title}</p>
          <p className="truncate text-sm opacity-70">{track.artist}</p>
        </div>
        <PreviewButton trackId={track.trackId} />
        <OpenInSpotify trackId={track.trackId} compact />
      </div>
    </section>
  );
}

// Layout rule used by the sections below: the number of items decides the layout, so a
// section always fills its width. One item gets a wide card, two or three share a row,
// four make a 2x2 block. No half-empty grids.
const FILL_COLUMNS: Record<number, string> = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2" };

export function Favorites({ favorites }: { favorites: FullProfile["favorites"] }) {
  if (favorites.length === 1) {
    const f = favorites[0];
    return (
      <section>
        <Heading>On repeat right now</Heading>
        <div className="flex items-center gap-4 rounded-xl border border-foreground/15 p-3">
          {f.artworkUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.artworkUrl} alt="" loading="lazy" className="h-28 w-28 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="h-28 w-28 shrink-0 rounded-lg bg-foreground/10" />
          )}
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-lg font-semibold leading-tight">{f.title}</p>
            <p className="mt-1 truncate text-sm opacity-70">{f.artist}</p>
            <PreviewButton trackId={f.trackId} className="mt-3" />
          </div>
        </div>
      </section>
    );
  }
  return (
    <section>
      <Heading>On repeat right now</Heading>
      <ul className={`grid gap-3 ${FILL_COLUMNS[favorites.length] ?? "grid-cols-2"}`}>
        {favorites.map((f) => (
          <li key={f.trackId} className="min-w-0">
            <div className="relative">
              {/* Not <Cover>: that takes a fixed pixel size, and these tiles stretch with the column. */}
              {f.artworkUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.artworkUrl} alt="" loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
              ) : (
                <div className="aspect-square w-full rounded-lg bg-foreground/10" />
              )}
              <PreviewButton trackId={f.trackId} className="absolute bottom-2 right-2 shadow" />
            </div>
            <p className="mt-1.5 truncate text-sm font-medium">{f.title}</p>
            <p className="truncate text-xs opacity-60">{f.artist}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A playlist's picture, or a tile with the service's initial when it has none. */
function PlaylistArt({ src, service, className }: { src: string | null; service: string; className: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className={`${className} rounded-lg object-cover`} />
  ) : (
    <span aria-hidden className={`${className} flex items-center justify-center rounded-lg bg-foreground/10 text-xl font-bold opacity-70`}>
      {service.slice(0, 1)}
    </span>
  );
}

export function Playlists({ links }: { links: FullProfile["links"] }) {
  const usable = links.flatMap((l) => {
    const service = serviceName(l.url);
    return service ? [{ ...l, service }] : [];
  });
  if (usable.length === 0) return null;
  // noopener: the new tab cannot reach back into this page. noreferrer: the music service
  // is not told which profile the click came from.
  const linkProps = { target: "_blank", rel: "noreferrer noopener" } as const;

  return (
    <section>
      <Heading>Playlists</Heading>
      {usable.length === 1 ? (
        <a href={usable[0].url} {...linkProps} className="flex items-center gap-4 rounded-xl border border-foreground/15 p-3">
          <PlaylistArt src={usable[0].imageUrl} service={usable[0].service} className="h-24 w-24 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 block text-lg font-semibold leading-tight">{usable[0].title}</span>
            <span className="mt-1 block text-sm opacity-60">{usable[0].service} ↗</span>
            <span className="sr-only">(opens {usable[0].service} in a new tab)</span>
          </span>
        </a>
      ) : (
        <ul className={`grid gap-3 ${FILL_COLUMNS[usable.length] ?? "grid-cols-2"}`}>
          {usable.map((l) => (
            <li key={l.position} className="min-w-0">
              <a href={l.url} {...linkProps} className="block">
                <PlaylistArt src={l.imageUrl} service={l.service} className="aspect-square w-full" />
                <span className="mt-1.5 block truncate text-sm font-medium">{l.title}</span>
                <span className="block text-xs opacity-60">{l.service} ↗</span>
                <span className="sr-only">(opens {l.service} in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TopSongs({ tracks }: { tracks: FullProfile["topTracks"] }) {
  return (
    <section>
      <Heading>Top songs · last 90 days</Heading>
      <ol className="flex flex-col">
        {tracks.map((t, i) => (
          <li key={t.trackId} className="flex items-center gap-3 py-2">
            <span className="w-4 text-right text-sm tabular-nums opacity-60">{i + 1}</span>
            <Cover src={t.artworkUrl} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{t.title}</p>
              <p className="truncate text-sm opacity-70">{t.artist} · {plural(t.plays, "play")}</p>
            </div>
            <PreviewButton trackId={t.trackId} />
            <OpenInSpotify trackId={t.trackId} compact />
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TopArtists({ artists }: { artists: FullProfile["topArtists"] }) {
  return (
    <section>
      <Heading>Top artists · last 90 days</Heading>
      <ol className="flex flex-col">
        {artists.map((a, i) => (
          <li key={a.artist} className="flex items-center gap-3 py-2">
            <span className="w-4 text-right text-sm tabular-nums opacity-60">{i + 1}</span>
            <Cover src={a.artworkUrl} size={44} className="rounded-full" />
            <p className="min-w-0 flex-1 truncate font-medium">{a.artist}</p>
            <span className="whitespace-nowrap text-xs opacity-60">{plural(a.plays, "play")}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
