import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getChartStatus, getSchools, getTopArtists, getTopListeners, getTopTracks } from "@/lib/charts";
import { createClient } from "@/lib/supabase/server";
import Cover from "@/components/cover";
import OpenInSpotify from "@/components/open-in-spotify";
import PreviewButton from "@/components/preview-button";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// One charts screen, used for all of NYU (`school` = null) and for a single school.
// Everything here is "this week": the last 7 listening days.
export default async function ChartView({ school }: { school: string | null }) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [status, tracks, artists, schools, listeners] = await Promise.all([
    getChartStatus(supabase, school),
    getTopTracks(supabase, school, 7, 20),
    getTopArtists(supabase, school, 7, 5),
    getSchools(supabase),
    getTopListeners(supabase, school, 7, 5),
  ]);

  const current = school ? schools.find((s) => s.slug === school) : null;
  const scopeName = current?.short_name ?? "NYU";
  const ranked = schools.filter((s) => s.unlocked);
  const waiting = schools.filter((s) => !s.unlocked);

  return (
    <main className="flex flex-col gap-7">
      <header>
        <h1 className="text-2xl font-bold">{scopeName} this week</h1>
        <nav aria-label="Chart scope" className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1 text-sm">
          <ScopeLink href="/charts" label="NYU" active={!school} />
          {schools.map((s) => (
            <ScopeLink key={s.slug} href={`/charts/${s.slug}`} label={s.short_name} active={school === s.slug} mine={s.slug === profile.school.slug} />
          ))}
        </nav>
      </header>

      {!status.unlocked ? (
        <section className="rounded-xl border border-foreground/15 p-5 text-center">
          <p className="text-lg font-semibold">
            {status.listeners} of {status.required} listeners
          </p>
          <p className="mt-1 text-sm opacity-70">
            The {scopeName} chart unlocks when {status.required} different people have checked in this week,
            so a chart never describes just one or two people. Invite friends to open it up.
          </p>
        </section>
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-xs uppercase tracking-wide opacity-60">Top songs</h2>
            <ol className="flex flex-col">
              {tracks.map((t) => (
                <li key={t.track_id} className="flex items-center gap-3 py-2">
                  <span className="w-6 text-right text-sm tabular-nums opacity-60">{t.rank}</span>
                  <Cover src={t.artwork_url} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.title}</p>
                    <p className="truncate text-sm opacity-70">{t.artist}</p>
                  </div>
                  <span className="whitespace-nowrap text-xs opacity-60">{plural(t.listeners, "listener")}</span>
                  <PreviewButton trackId={t.track_id} />
                  <OpenInSpotify trackId={t.track_id} compact />
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h2 className="mb-2 text-xs uppercase tracking-wide opacity-60">Top artists</h2>
            <ol className="flex flex-col">
              {artists.map((a) => (
                <li key={a.artist} className="flex items-center gap-3 py-2">
                  <span className="w-6 text-right text-sm tabular-nums opacity-60">{a.rank}</span>
                  <Cover src={a.artwork_url} size={44} className="rounded-full" />
                  <p className="min-w-0 flex-1 truncate font-medium">{a.artist}</p>
                  <span className="whitespace-nowrap text-xs opacity-60">{plural(a.listeners, "listener")}</span>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h2 className="mb-2 text-xs uppercase tracking-wide opacity-60">Top listeners</h2>
            <ol className="flex flex-col">
              {listeners.map((l) => (
                <li key={l.handle} className="flex items-center gap-3 py-2">
                  <span className="w-6 text-right text-sm tabular-nums opacity-60">{l.rank}</span>
                  <p className="min-w-0 flex-1 truncate">
                    <Link href={"/u/" + l.handle} className="font-medium hover:underline">@{l.handle}</Link>
                    <span className="opacity-60"> · {l.school}</span>
                    {l.automatic && <span className="ml-2 rounded bg-foreground/10 px-1.5 py-0.5 text-xs">Autopilot</span>}
                  </p>
                  <span className="whitespace-nowrap text-xs opacity-60">{plural(l.points, "song")}</span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}

      {!school && (
        <section>
          <h2 className="mb-1 text-xs uppercase tracking-wide opacity-60">School vs school</h2>
          <p className="mb-2 text-xs opacity-60">Ranked by songs per member, so big schools do not win on size.</p>
          <ol className="flex flex-col">
            {ranked.map((s) => (
              <li key={s.slug}>
                <Link href={`/charts/${s.slug}`} className="flex items-center gap-3 py-2">
                  <span className="w-6 text-right text-sm tabular-nums opacity-60">{s.rank}</span>
                  <span className={`min-w-0 flex-1 truncate ${s.slug === profile.school.slug ? "font-bold" : "font-medium"}`}>
                    {s.short_name}
                    {s.slug === profile.school.slug && <span className="font-normal opacity-60"> · you</span>}
                  </span>
                  <span className="whitespace-nowrap text-xs opacity-60">
                    {s.points_per_member} per member · {plural(s.listeners, "listener")}
                  </span>
                </Link>
              </li>
            ))}
            {waiting.map((s) => (
              <li key={s.slug} className="flex items-center gap-3 py-2 opacity-50">
                <span className="w-6" />
                <span className="min-w-0 flex-1 truncate">{s.short_name}</span>
                <span className="whitespace-nowrap text-xs">needs {plural(s.required - s.listeners, "more listener")}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="text-xs opacity-50">
        Each person counts once per song per day, however many times they play it.
      </p>
    </main>
  );
}

function ScopeLink({ href, label, active, mine }: { href: string; label: string; active: boolean; mine?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`whitespace-nowrap rounded-full border px-3 py-1 ${
        active ? "border-foreground bg-foreground text-background" : "border-foreground/20"
      }`}
    >
      {label}
      {mine && !active ? " ★" : ""}
    </Link>
  );
}
