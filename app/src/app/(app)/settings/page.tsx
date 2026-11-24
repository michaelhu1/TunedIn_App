import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { appleMusicEnabled } from "@/lib/sources/apple-music-token";
import { createClient } from "@/lib/supabase/server";
import AppleMusicConnect from "@/components/apple-music-connect";
import AppearanceSettings from "@/components/appearance-settings";
import BlockedList, { type BlockedRow } from "@/components/blocked-list";
import DeleteAccount from "@/components/delete-account";
import LastfmConnect from "@/components/lastfm-connect";
import PrivacySettings from "@/components/privacy-settings";
import SignOutButton from "@/components/sign-out-button";

export const metadata = { title: "Settings · TunedIn" };

// Everything you set once and rarely touch. Opened from the gear on the Me tab.
export default async function SettingsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ data: settings }, { data: blocked }] = await Promise.all([
    supabase
      .from("user_settings")
      .select("lastfm_username, lastfm_status, lastfm_synced_at, apple_music_connected_at, apple_music_status, apple_music_synced_at, share_location, ghost_mode, count_me_nearby")
      .eq("user_id", profile.id)
      .maybeSingle(),
    supabase.rpc("my_blocks"),
  ]);

  return (
    <main className="flex flex-col gap-8">
      <header>
        <Link href="/me" className="text-sm underline opacity-70">
          Back to your profile
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Settings</h1>
      </header>

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
        {/* One automatic source at a time: with Apple Music connected, the Last.fm form is
            hidden until they disconnect. */}
        {settings?.apple_music_connected_at ? (
          <AppleMusicConnect
            connected
            status={settings.apple_music_status ?? null}
            syncedAt={settings.apple_music_synced_at ?? null}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <LastfmConnect
              username={settings?.lastfm_username ?? null}
              status={settings?.lastfm_status ?? null}
              syncedAt={settings?.lastfm_synced_at ?? null}
            />
            {appleMusicEnabled() && (
              <p className="text-sm">
                <span className="opacity-70">On Apple Music? </span>
                <Link href="/connect" className="underline">
                  Connect Apple Music
                </Link>
              </p>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-xs uppercase tracking-wide opacity-60">Appearance</h2>
        <p className="mb-3 text-xs opacity-70">How TunedIn looks on this phone. Other people do not see these choices.</p>
        <AppearanceSettings />
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
        <a href="https://www.last.fm" target="_blank" rel="noreferrer" className="underline">Last.fm</a> and Apple Music. Map data ©
        OpenStreetMap contributors, tiles by OpenFreeMap. TunedIn is open source under the MIT license.{" "}
        <Link href="/privacy" className="underline">
          Privacy
        </Link>
      </p>
    </main>
  );
}
