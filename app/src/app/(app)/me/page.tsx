import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMyStats } from "@/lib/my-stats";
import AppearanceSettings from "@/components/appearance-settings";
import Avatar from "@/components/avatar";
import BlockedList, { type BlockedRow } from "@/components/blocked-list";
import DeleteAccount from "@/components/delete-account";
import LastfmConnect from "@/components/lastfm-connect";
import MyListening, { RANGE_DAYS, type RangeKey } from "@/components/my-listening";
import PrivacySettings from "@/components/privacy-settings";
import SignOutButton from "@/components/sign-out-button";

export default async function MePage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const wanted = (await searchParams).range;
  const range: RangeKey = wanted === "month" || wanted === "all" ? wanted : "week";

  const [{ data: settings }, stats, { data: blocked }, { data: mine }, { count: friendCount }] = await Promise.all([
    supabase
      .from("user_settings")
      .select("lastfm_username, lastfm_status, lastfm_synced_at, share_location, ghost_mode, count_me_nearby")
      .eq("user_id", profile.id)
      .maybeSingle(),
    getMyStats(supabase, profile.id, RANGE_DAYS[range]),
    supabase.rpc("my_blocks"),
    supabase.from("profiles").select("display_name, bio, avatar_url, class_year").eq("id", profile.id).maybeSingle(),
    supabase.from("my_friendships").select("friend_id", { count: "exact", head: true }).eq("status", "accepted"),
  ]);

  return (
    <main className="flex flex-col gap-8">
      {/* A snippet of your own profile, the way others see it, with the two ways in. */}
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <Avatar handle={profile.handle} src={mine?.avatar_url ?? null} size={72} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold">{mine?.display_name ?? `@${profile.handle}`}</h1>
            <p className="truncate text-sm opacity-60">
              {mine?.display_name ? `@${profile.handle} · ` : ""}
              {profile.school.short_name}
              {mine?.class_year ? ` ’${String(mine.class_year).slice(-2)}` : ""}
              {" · "}
              <Link href="/friends" className="underline">
                {friendCount ?? 0} friend{friendCount === 1 ? "" : "s"}
              </Link>
            </p>
          </div>
        </div>
        {mine?.bio ? (
          <p className="whitespace-pre-line text-sm">{mine.bio}</p>
        ) : (
          <p className="text-sm opacity-60">No bio yet. Add one so people know what you are into.</p>
        )}
        <div className="flex gap-2">
          <Link href={`/u/${profile.handle}`} className="flex-1 rounded-lg border border-foreground/20 py-2 text-center text-sm font-medium hover:bg-foreground/5">
            View profile
          </Link>
          <Link href="/me/edit" className="flex-1 rounded-lg border border-foreground/20 py-2 text-center text-sm font-medium hover:bg-foreground/5">
            Edit profile
          </Link>
        </div>
      </header>

      <MyListening stats={stats} range={range} />

      <section>
        <h2 className="mb-3 text-xs uppercase tracking-wide opacity-60">Appearance</h2>
        <AppearanceSettings />
      </section>

      <section>
        <h2 className="mb-3 text-xs uppercase tracking-wide opacity-60">Privacy</h2>
        <PrivacySettings
          userId={profile.id}
          shareLocation={settings?.share_location ?? false}
          ghostMode={settings?.ghost_mode ?? false}
          countMeNearby={settings?.count_me_nearby ?? true}
        />
      </section>

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-wide opacity-60">Your music</h2>
        <LastfmConnect
          username={settings?.lastfm_username ?? null}
          status={settings?.lastfm_status ?? null}
          syncedAt={settings?.lastfm_synced_at ?? null}
        />
      </section>

      <section id="blocked" className="scroll-mt-6">
        <h2 className="mb-2 text-xs uppercase tracking-wide opacity-60">Blocked people</h2>
        <BlockedList me={profile.id} rows={(blocked ?? []) as BlockedRow[]} />
      </section>

      <SignOutButton />
      <DeleteAccount handle={profile.handle} />

      {/* Credits the data providers ask for. */}
      <p className="text-xs opacity-50">
        Song details and previews from Deezer. Automatic listening data from{" "}
        <a href="https://www.last.fm" target="_blank" rel="noreferrer" className="underline">Last.fm</a>. Map data ©
        OpenStreetMap contributors, tiles by OpenFreeMap. TunedIn is open source under the MIT license.{" "}
        <Link href="/privacy" className="underline">
          Privacy
        </Link>
      </p>
    </main>
  );
}
