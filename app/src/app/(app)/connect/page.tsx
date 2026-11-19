import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ConnectSteps from "./steps";

// "Connect your music": the step right after sign-up, also reachable later from Home and Me.
// TunedIn does not play music. It reads what you already stream, through a free Last.fm
// account linked to Spotify. Skipping is fine; you can set songs by hand instead.
export default async function ConnectPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("user_settings")
    .select("lastfm_username")
    .eq("user_id", profile.id)
    .maybeSingle();

  return (
    <main className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Connect your music</h1>
        <p className="mt-2 text-sm opacity-70">
          TunedIn shows what you are already listening to on Spotify. It reads that through Last.fm, a free
          service that keeps a log of your plays. Set it up once, about two minutes, and you never have to
          touch it again. Your plays then count toward the NYU charts, your stats and your taste matches.
        </p>
      </header>

      <ConnectSteps connectedAs={settings?.lastfm_username ?? null} />

      <Link href="/home" className="text-center text-sm underline opacity-70">
        {settings?.lastfm_username ? "Done" : "Skip for now. I will set songs by hand (they will not count toward stats)."}
      </Link>
    </main>
  );
}
