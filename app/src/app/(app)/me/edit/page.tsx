import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { BIO_MAX, DISPLAY_NAME_MAX, getFullProfile, LINK_HOSTS, MAX_FAVORITES, MAX_LINKS } from "@/lib/profile";
import { getPopularArtists } from "@/lib/sources/artists";
import { createClient } from "@/lib/supabase/server";
import ProfileEditor from "@/components/profile-editor/profile-editor";

export default async function EditProfilePage() {
  const me = await requireProfile();
  const supabase = await createClient();

  const [profile, { data: own }, popularArtists] = await Promise.all([
    getFullProfile(supabase, me.handle),
    supabase.from("profiles").select("university_id").eq("id", me.id).single(),
    getPopularArtists(18),
  ]);
  // requireProfile just found this row, so this only happens in a race (account deleted).
  if (!profile || !own) notFound();

  // Only schools at your own university; the database would refuse any other anyway.
  const { data: schools } = await supabase
    .from("schools")
    .select("id, name")
    .eq("university_id", own.university_id)
    .order("name");

  return (
    <main className="flex flex-col gap-8">
      <header>
        <Link href="/me" className="text-sm opacity-70 hover:opacity-100">
          ← Back
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Edit profile</h1>
        <p className="mt-1 text-sm opacity-70">
          Laid out in the same order as your profile. Everything here is visible to other signed-in members.{" "}
          <Link href="/me" className="underline">
            See your profile
          </Link>
        </p>
      </header>

      <ProfileEditor
        profile={profile}
        schools={schools ?? []}
        popularArtists={popularArtists}
        limits={{
          maxFavorites: MAX_FAVORITES,
          maxLinks: MAX_LINKS,
          bioMax: BIO_MAX,
          displayNameMax: DISPLAY_NAME_MAX,
          linkHosts: LINK_HOSTS,
        }}
      />
    </main>
  );
}
