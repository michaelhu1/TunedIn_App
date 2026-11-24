import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import AppleMusicConnect from "@/components/apple-music-connect";
import { appleMusicEnabled } from "@/lib/sources/apple-music-token";
import { lastfmWebAuthEnabled } from "@/lib/sources/lastfm-auth";
import { createClient } from "@/lib/supabase/server";
import ConnectSteps from "./steps";

// "Connect your music". Reached from the prompt on Home and from Me, never forced during
// sign-up. TunedIn does not play music: it reads what you already stream. Apple Music is
// read directly (one button); Spotify is read through a free Last.fm account linked to it.
// The Apple Music part only appears once the server has its Apple keys (docs/APPLE_MUSIC.md).
export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ lastfm?: string }> }) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("user_settings")
    .select("lastfm_username, apple_music_connected_at, apple_music_status, apple_music_synced_at")
    .eq("user_id", profile.id)
    .maybeSingle();
  const outcome = (await searchParams).lastfm;
  const appleConnected = Boolean(settings?.apple_music_connected_at);
  // Shown when the feature is on, and also to anyone already connected so they can disconnect.
  const showApple = appleMusicEnabled() || appleConnected;
  const connected = appleConnected || Boolean(settings?.lastfm_username);

  return (
    <main className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">{showApple ? "Connect your music" : "Connect Spotify"}</h1>
        <p className="mt-2 text-sm opacity-70">
          {showApple
            ? "Once, and it takes a minute or two. After that everything you play shows up here by itself and counts toward the charts, your stats and your taste matches. Pick the service you listen on."
            : "Two steps, about two minutes, once. After that everything you play on Spotify shows up here by itself and counts toward the charts, your stats and your taste matches."}
        </p>
      </header>

      {showApple && (
        <section className="flex flex-col gap-2 rounded-xl border border-foreground/15 p-4">
          <h2 className="text-sm font-semibold">Apple Music</h2>
          <AppleMusicConnect
            connected={appleConnected}
            status={settings?.apple_music_status ?? null}
            syncedAt={settings?.apple_music_synced_at ?? null}
            replacesLastfm={Boolean(settings?.lastfm_username)}
            canAuthorize={appleMusicEnabled()}
          />
        </section>
      )}

      {showApple && <h2 className="-mb-3 text-sm font-semibold">Spotify</h2>}

      <ConnectSteps
        connectedAs={settings?.lastfm_username ?? null}
        oneTap={lastfmWebAuthEnabled()}
        justConnected={outcome === "connected"}
        failed={outcome === "failed"}
      />

      <Link href="/home" className="text-center text-sm underline opacity-70">
        {connected ? "Done" : "Not now"}
      </Link>
    </main>
  );
}
