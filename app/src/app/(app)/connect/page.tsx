import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { lastfmWebAuthEnabled } from "@/lib/sources/lastfm-auth";
import { createClient } from "@/lib/supabase/server";
import ConnectSteps from "./steps";

// "Connect your music". Reached from the prompt on Home and from Me, never forced during
// sign-up. TunedIn does not play music: it reads what you already stream, through a free
// Last.fm account linked to Spotify.
export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ lastfm?: string }> }) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("user_settings")
    .select("lastfm_username")
    .eq("user_id", profile.id)
    .maybeSingle();
  const outcome = (await searchParams).lastfm;

  return (
    <main className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Connect Spotify</h1>
        <p className="mt-2 text-sm opacity-70">
          Two steps, about two minutes, once. After that everything you play on Spotify shows up here by
          itself and counts toward the charts, your stats and your taste matches.
        </p>
      </header>

      <ConnectSteps
        connectedAs={settings?.lastfm_username ?? null}
        oneTap={lastfmWebAuthEnabled()}
        justConnected={outcome === "connected"}
        failed={outcome === "failed"}
      />

      <Link href="/home" className="text-center text-sm underline opacity-70">
        {settings?.lastfm_username ? "Done" : "Not now"}
      </Link>
    </main>
  );
}
