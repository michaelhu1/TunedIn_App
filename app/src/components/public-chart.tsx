import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicChart } from "@/lib/public-charts";
import Cover from "@/components/cover";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The public charts page: what NYU (or one school) has on repeat this week, for anyone
// with the link. It doubles as the page a shared link lands on, so it ends with an
// invitation to join.
export default async function PublicChart({ school }: { school: string | null }) {
  const { status, tracks, artists, schools, current } = await getPublicChart(school);
  if (school && !current) notFound();
  const scopeName = current?.short_name ?? "NYU";
  const ranked = schools.filter((s) => s.unlocked);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-7 px-5 py-8">
      <header>
        <Link href="/" className="text-sm font-semibold opacity-70">
          TunedIn
        </Link>
        <h1 className="mt-1 text-3xl font-bold">{scopeName} this week</h1>
        <p className="mt-1 text-sm opacity-70">What {scopeName === "NYU" ? "NYU students are" : `${scopeName} is`} listening to, updated through the day.</p>
        <nav aria-label="School" className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1 text-sm">
          <Chip href="/nyu" label="NYU" active={!school} />
          {schools.map((s) => (
            <Chip key={s.slug} href={`/nyu/${s.slug}`} label={s.short_name} active={school === s.slug} />
          ))}
        </nav>
      </header>

      {!status.unlocked ? (
        <section className="rounded-xl border border-foreground/15 p-5 text-center">
          <p className="text-lg font-semibold">This chart is still filling up.</p>
          <p className="mt-1 text-sm opacity-70">
            It appears once {status.required} different people at {scopeName} have listened this week. Be one of
            them.
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
                  <Cover src={t.artwork_url} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.title}</p>
                    <p className="truncate text-sm opacity-70">{t.artist}</p>
                  </div>
                  <span className="whitespace-nowrap text-xs opacity-60">{plural(t.listeners, "listener")}</span>
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
                  <Cover src={a.artwork_url} size={48} className="rounded-full" />
                  <p className="min-w-0 flex-1 truncate font-medium">{a.artist}</p>
                  <span className="whitespace-nowrap text-xs opacity-60">{plural(a.listeners, "listener")}</span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}

      {!school && ranked.length > 0 && (
        <section>
          <h2 className="mb-1 text-xs uppercase tracking-wide opacity-60">School vs school</h2>
          <p className="mb-2 text-xs opacity-60">Ranked by songs per member, so big schools do not win on size.</p>
          <ol className="flex flex-col">
            {ranked.map((s) => (
              <li key={s.slug}>
                <Link href={`/nyu/${s.slug}`} className="flex items-center gap-3 py-2">
                  <span className="w-6 text-right text-sm tabular-nums opacity-60">{s.rank}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{s.short_name}</span>
                  <span className="whitespace-nowrap text-xs opacity-60">{s.points_per_member} per member</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="rounded-xl border border-foreground/15 p-5 text-center">
        <p className="font-semibold">See what your friends are playing.</p>
        <p className="mt-1 text-sm opacity-70">TunedIn is free and for NYU students. Your plays count toward these charts.</p>
        <Link href="/login" className="btn mt-3 block">
          Join with your NYU email
        </Link>
      </section>

      <footer className="text-xs opacity-50">
        Totals only: each person counts once per song per day, and nobody is shown individually.{" "}
        <Link href="/privacy" className="underline">
          Privacy
        </Link>
      </footer>
    </main>
  );
}

function Chip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`whitespace-nowrap rounded-full border px-3 py-1 ${
        active ? "border-foreground bg-foreground text-background" : "border-foreground/20"
      }`}
    >
      {label}
    </Link>
  );
}
