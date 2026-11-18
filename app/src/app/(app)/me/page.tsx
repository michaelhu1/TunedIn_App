import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import LastfmConnect from "@/components/lastfm-connect";
import PrivacySettings from "@/components/privacy-settings";
import SignOutButton from "@/components/sign-out-button";

export default async function MePage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("user_settings")
    .select("lastfm_username, share_location, ghost_mode")
    .eq("user_id", profile.id)
    .maybeSingle();

  return (
    <main className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold">@{profile.handle}</h1>
        <p className="mt-1 opacity-70">{profile.school.name}</p>
      </header>

      <section>
        <h2 className="mb-3 text-xs uppercase tracking-wide opacity-60">Privacy</h2>
        <PrivacySettings
          userId={profile.id}
          shareLocation={settings?.share_location ?? false}
          ghostMode={settings?.ghost_mode ?? false}
        />
      </section>

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-wide opacity-60">Autopilot</h2>
        <LastfmConnect username={settings?.lastfm_username ?? null} />
      </section>

      <SignOutButton />

      {/* Credits the data providers ask for. */}
      <p className="text-xs opacity-50">
        Song details and previews from Deezer. Automatic listening data from{" "}
        <a href="https://www.last.fm" target="_blank" rel="noreferrer" className="underline">Last.fm</a>. Map data ©
        OpenStreetMap contributors, tiles by OpenFreeMap. TunedIn is open source under the MIT license.
      </p>
    </main>
  );
}
