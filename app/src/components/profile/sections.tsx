import type { FullProfile } from "@/lib/profile";
import Cover from "@/components/cover";
import OpenInSpotify from "@/components/open-in-spotify";
import PreviewButton from "@/components/preview-button";
import { serviceName } from "./service-name";

// The read-only blocks of a profile page. Each one is plain data in, markup out, so they
// are server components and ship no JavaScript (the play buttons inside are the exception).

const LIVE_MINUTES = 30; // same window the map uses for "live now"
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 text-xs uppercase tracking-wide opacity-60">{children}</h2>;
}

export function NowPlaying({ track }: { track: NonNullable<FullProfile["nowPlaying"]> }) {
  // Server time at render. The page is rendered per request (it reads cookies), so this is fresh.
  const live = Date.now() - new Date(track.updatedAt).getTime() < LIVE_MINUTES * 60_000;
  return (
    <section aria-label="Now playing" className="rounded-xl border border-foreground/15 p-4">
      <p className="mb-2 text-xs uppercase tracking-wide opacity-60">
        {live ? <><span className="text-green-500" aria-hidden>●</span> Live now</> : "Earlier today"}
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

export function Favorites({ favorites }: { favorites: FullProfile["favorites"] }) {
  return (
    <section>
      <Heading>On repeat right now</Heading>
      {/* Two across fits a phone; with at most four songs that is a 2x2 grid. */}
      <ul className="grid grid-cols-2 gap-3">
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

export function Playlists({ links }: { links: FullProfile["links"] }) {
  const usable = links.flatMap((l) => {
    const service = serviceName(l.url);
    return service ? [{ ...l, service }] : [];
  });
  if (usable.length === 0) return null;
  return (
    <section>
      <Heading>Playlists</Heading>
      <ul className="flex flex-col gap-2">
        {usable.map((l) => (
          <li key={l.position}>
            <a
              href={l.url}
              target="_blank"
              // noopener: the new tab cannot reach back into this page. noreferrer: the music
              // service is not told which profile the click came from.
              rel="noreferrer noopener"
              className="flex items-center gap-3 rounded-xl border border-foreground/15 px-4 py-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{l.title}</span>
                <span className="block text-xs opacity-60">{l.service}</span>
              </span>
              <span aria-hidden className="opacity-60">↗</span>
              <span className="sr-only">(opens {l.service} in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
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
