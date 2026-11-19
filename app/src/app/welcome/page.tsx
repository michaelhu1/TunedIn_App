import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getPopularArtists } from "@/lib/sources/artists";
import ArtistPicker from "@/components/artist-picker";

// The last step of sign-up, and the only one about music: tap a few artists you like.
// It replaces connecting a streaming service during sign-up, which took minutes and lost
// people. Connecting is still there afterwards, as a prompt on Home.
export default async function WelcomePage() {
  await requireProfile();
  const popular = await getPopularArtists(18);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col gap-5 px-6 py-10">
      <header>
        <p className="text-sm opacity-60">Last step</p>
        <h1 className="mt-1 text-3xl font-bold">Who do you listen to?</h1>
        <p className="mt-2 text-sm opacity-70">
          Pick up to five artists. They go on your profile and help us find people with your taste.
        </p>
      </header>
      <ArtistPicker popular={popular} doneHref="/home" doneLabel="Start using TunedIn" />
      <Link href="/home" className="text-center text-sm underline opacity-70">
        Skip for now
      </Link>
    </main>
  );
}
