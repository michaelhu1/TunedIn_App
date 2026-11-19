import Link from "next/link";
import type { MyStats } from "@/lib/my-stats";
import Cover from "@/components/cover";
import OpenInSpotify from "@/components/open-in-spotify";
import PreviewButton from "@/components/preview-button";

const RANGES = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "all", label: "All time" },
] as const;
export type RangeKey = (typeof RANGES)[number]["key"];
export const RANGE_DAYS: Record<RangeKey, number | null> = { week: 7, month: 30, all: null };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// "Your listening": your own top songs, artists and history. Only you can see this.
export default function MyListening({ stats, range }: { stats: MyStats; range: RangeKey }) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs uppercase tracking-wide opacity-60">Your listening</h2>
        <nav aria-label="Time range" className="flex gap-1 text-xs">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={`/me?range=${r.key}`}
              scroll={false}
              aria-current={r.key === range ? "page" : undefined}
              className={`rounded-full border px-2.5 py-1 ${
                r.key === range ? "border-foreground bg-foreground text-background" : "border-foreground/20"
              }`}
            >
              {r.label}
            </Link>
          ))}
        </nav>
      </div>

      {stats.totalPlays === 0 ? (
        <p className="text-sm opacity-60">
          Nothing in this period yet. <Link href="/home" className="underline">Check in a song</Link> to start your history.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-4 gap-2 text-center">
            {[
              [stats.totalPlays, "plays"],
              [stats.differentSongs, "songs"],
              [stats.differentArtists, "artists"],
              [stats.activeDays, "days"],
            ].map(([n, label]) => (
              <div key={label} className="rounded-xl border border-foreground/15 py-3">
                <dd className="text-xl font-bold tabular-nums">{n}</dd>
                <dt className="text-xs opacity-60">{label}</dt>
              </div>
            ))}
          </dl>

          <div>
            <h3 className="mb-1 text-sm font-semibold">Top songs</h3>
            <ol className="flex flex-col">
              {stats.topTracks.map((t, i) => (
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
          </div>

          <div>
            <h3 className="mb-1 text-sm font-semibold">Top artists</h3>
            <ol className="flex flex-col">
              {stats.topArtists.map((a, i) => (
                <li key={a.artist} className="flex items-center gap-3 py-2">
                  <span className="w-4 text-right text-sm tabular-nums opacity-60">{i + 1}</span>
                  <Cover src={a.artworkUrl} size={44} className="rounded-full" />
                  <p className="min-w-0 flex-1 truncate font-medium">{a.artist}</p>
                  <span className="whitespace-nowrap text-xs opacity-60">{plural(a.plays, "play")}</span>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h3 className="mb-1 text-sm font-semibold">Recently played</h3>
            <ul className="flex flex-col">
              {stats.recent.map((p, i) => (
                <li key={`${p.trackId}-${i}`} className="flex items-center gap-3 py-1.5">
                  <Cover src={p.artworkUrl} size={36} />
                  <p className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-medium">{p.title}</span>
                    <span className="opacity-60"> · {p.artist}</span>
                  </p>
                  <span className="whitespace-nowrap text-xs opacity-50">{when(p.playedAt)}</span>
                </li>
              ))}
            </ul>
          </div>

          {stats.capped && <p className="text-xs opacity-50">Based on your most recent 1,000 plays.</p>}
        </>
      )}
      <p className="text-xs opacity-50">Only you can see this. Every play counts here, repeats included.</p>
    </section>
  );
}
