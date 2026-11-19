import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getFriendsTopArtists, getFriendsTopTracks, getSchools } from "@/lib/charts";
import { createClient } from "@/lib/supabase/server";
import Cover from "@/components/cover";
import OpenInSpotify from "@/components/open-in-spotify";
import PreviewButton from "@/components/preview-button";
import { ScopeNav } from "@/components/chart-view";

// The Friends category on Charts: what you and your friends played this week. Unlike the
// campus charts, each row says who played it, because these are people you know. Friends
// who hide their stats or are in ghost mode are left out (decided in the database).
function who(handles: string[], me: string): string {
  const names = handles.map((h) => (h === me ? "you" : `@${h}`)).sort((a, b) => (a === "you" ? -1 : b === "you" ? 1 : a.localeCompare(b)));
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

export default async function FriendsChartView() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [tracks, artists, schools, { count: friendCount }] = await Promise.all([
    getFriendsTopTracks(supabase),
    getFriendsTopArtists(supabase),
    getSchools(supabase),
    supabase.from("my_friendships").select("friend_id", { count: "exact", head: true }).eq("status", "accepted"),
  ]);

  return (
    <main className="flex flex-col gap-7">
      <header>
        <h1 className="text-2xl font-bold">Friends this week</h1>
        <ScopeNav schools={schools} active="friends" mySchool={profile.school.slug} />
      </header>

      {(friendCount ?? 0) === 0 ? (
        <section className="rounded-xl border border-foreground/15 p-5 text-sm">
          <p className="font-semibold">Add friends to see this chart.</p>
          <p className="mt-1 opacity-70">It ranks what you and your friends played this week, and shows who played what.</p>
          <Link href="/people" className="btn mt-3 block">
            Find people
          </Link>
        </section>
      ) : tracks.length === 0 ? (
        <p className="text-sm opacity-60">Nothing yet this week from you or your friends.</p>
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
                    <p className="truncate text-xs opacity-60">{who(t.handles ?? [], profile.handle)}</p>
                  </div>
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
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.artist}</p>
                    <p className="truncate text-xs opacity-60">{who(a.handles ?? [], profile.handle)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}

      <p className="text-xs opacity-50">
        Includes you and friends who show their stats. Each person counts once per song per day.
      </p>
    </main>
  );
}
