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

export function TasteMatchCard({ match }: { match: TasteMatch }) {
  const shared = sharedArtistsSentence(match.sharedArtists, match.sharedCount);
  return (
    <section aria-labelledby="taste-match-heading" className="scroll-mt-6 rounded-xl border border-foreground/15 p-4">
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

/** What they listen to and what they are up for, as two rows of tags straight under the
 *  bio. There are no visible headings: the two rows are told apart by how they look (filled
 *  genre tags, outlined "open to" tags after a small label), and each list still carries a
 *  name for screen readers. */
export function TasteTags({ genres, openTo }: { genres: string[]; openTo: FullProfile["openTo"] }) {
  const genreTags = knownGenres(genres);
  const openLabels = labelsFor(openTo, OPEN_TO);
  if (genreTags.length === 0 && openLabels.length === 0) return null;
  return (
    <section aria-label="Music taste" className="flex flex-col gap-2.5">
      {genreTags.length > 0 && (
        <ul aria-label="Genres" className="flex flex-wrap gap-2">
          {genreTags.map((g) => (
            <li key={g} className="rounded-full bg-accent px-3 py-1 text-sm font-medium text-accent-foreground">
              {g}
            </li>
          ))}
        </ul>
      )}
      {openLabels.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span id="open-to-label" className="text-xs opacity-70">
            Open to
          </span>
          <ul aria-labelledby="open-to-label" className="contents">
            {openLabels.map((o) => (
              <li key={o} className="rounded-full border border-foreground/15 bg-surface px-3 py-1 text-sm">
                {o}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** "🎸 Guitar · Write songs · In a band — bass in a jazz trio": one line in the header,
 *  beside major and hometown, because making music is who someone is rather than a tag. */
export function MakesMusicLine({ roles, note }: { roles: FullProfile["musicRoles"]; note: string | null }) {
  const roleLabels = labelsFor(roles, MUSIC_ROLES);
  // The note explains the roles, so it only shows alongside them.
  if (roleLabels.length === 0) return null;
  return (
    <p className="line-clamp-2 break-words text-sm opacity-70">
      <span aria-hidden className="mr-1">🎸</span>
      <span className="sr-only">Makes music: </span>
      {roleLabels.join(" · ")}
      {note && <> — {note}</>}
    </p>
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

/** Favourite artists. The ones the viewer also picked come first and are filled in. */
export function FavoriteArtists({ artists, sharedWithViewer }: { artists: string[]; sharedWithViewer: string[] }) {
  if (artists.length === 0) return null;
  const shared = new Set(sharedWithViewer.map((a) => a.toLowerCase()));
  const ordered = [...artists.filter((a) => shared.has(a.toLowerCase())), ...artists.filter((a) => !shared.has(a.toLowerCase()))];
  return (
    <section className="flex flex-col gap-2">
      <Heading>Favourite artists</Heading>
      <ul aria-label="Favourite artists" className="flex flex-wrap gap-2">
        {ordered.map((a) =>
          shared.has(a.toLowerCase()) ? (
            <li key={a} className="rounded-full bg-accent px-3 py-1 text-sm font-medium text-accent-foreground">
              {a}
              <span className="sr-only"> (you both like)</span>
            </li>
          ) : (
            <li key={a} className="rounded-full border border-foreground/20 px-3 py-1 text-sm">
              {a}
            </li>
          ),
        )}
      </ul>
      {sharedWithViewer.length > 0 && <p className="text-sm opacity-80">You both like {joinNames(sharedWithViewer)}.</p>}
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

/** A small square Instagram button for the row of actions under the bio. */
export function InstagramButton({ handle }: { handle: string | null }) {
  const url = instagramUrl(handle);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener" // same reasoning as the playlist links
      aria-label={`@${handle} on Instagram (opens in a new tab)`}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-foreground/20 hover:bg-foreground/5"
    >
      <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
      </svg>
    </a>
  );
}

/** What they are playing, as one line in the header: status, not a section of its own. */
export function NowPlayingLine({ track }: { track: NonNullable<FullProfile["nowPlaying"]> }) {
  // Server time at render. The page is rendered per request (it reads cookies), so this is fresh.
  const live = Date.now() - new Date(track.updatedAt).getTime() < LIVE_MINUTES * 60_000;
  return (
    <section aria-label="Now playing" className="flex items-center gap-2.5 rounded-full bg-surface py-1 pl-1 pr-1.5">
      <Cover src={track.artworkUrl} size={32} className="rounded-full" />
      <p className="min-w-0 flex-1 truncate text-sm">
        {live ? (
          <>
            <span className="text-live" aria-hidden>● </span>
            <span className="sr-only">Listening now: </span>
          </>
        ) : (
          <span className="opacity-70">Earlier: </span>
        )}
        <span className="font-medium">{track.title}</span>
        <span className="opacity-70"> · {track.artist}</span>
      </p>
      <PreviewButton trackId={track.trackId} className="scale-75" />
    </section>
  );
}

/** The taste match as a small badge beside the name; the full card explains it lower down. */
export function MatchBadge({ score }: { score: number }) {
  return (
    <a href="#taste-match-heading" className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold tabular-nums text-accent-foreground">
      {score}% <span className="sr-only">taste </span>match
    </a>
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
        <Heading>On repeat</Heading>
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
      <Heading>On repeat</Heading>
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

// The top lists are the wordiest part of a profile, so they open with three rows and keep
// the rest behind "Show all" (a <details>, which needs no JavaScript).
const TOP_SHOWN = 3;

function TopList<T>({ title, items, row }: { title: string; items: T[]; row: (item: T, index: number) => React.ReactNode }) {
  const rest = items.slice(TOP_SHOWN);
  return (
    <section>
      <Heading>{title}</Heading>
      <ol className="flex flex-col">{items.slice(0, TOP_SHOWN).map(row)}</ol>
      {rest.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer py-1 text-sm underline opacity-70 group-open:hidden">Show all {items.length}</summary>
          <ol start={TOP_SHOWN + 1} className="flex flex-col">
            {rest.map((item, i) => row(item, i + TOP_SHOWN))}
          </ol>
        </details>
      )}
    </section>
  );
}

export function TopSongs({ tracks }: { tracks: FullProfile["topTracks"] }) {
  return (
    <TopList
      title="Top songs · last 90 days"
      items={tracks}
      row={(t, i) => (
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
      )}
    />
  );
}

export function TopArtists({ artists }: { artists: FullProfile["topArtists"] }) {
  return (
    <TopList
      title="Top artists · last 90 days"
      items={artists}
      row={(a, i) => (
        <li key={a.artist} className="flex items-center gap-3 py-2">
          <span className="w-4 text-right text-sm tabular-nums opacity-60">{i + 1}</span>
          <Cover src={a.artworkUrl} size={44} className="rounded-full" />
          <p className="min-w-0 flex-1 truncate font-medium">{a.artist}</p>
          <span className="whitespace-nowrap text-xs opacity-60">{plural(a.plays, "play")}</span>
        </li>
      )}
    />
  );
}
