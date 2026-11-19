"use client";

// Type-only import: erased at build time, so the server-only module is not bundled here.
import type { FullProfile } from "@/lib/profile";
import ArtistPicker from "@/components/artist-picker";
import AvatarUpload from "@/components/profile-editor/avatar-upload";
import AboutForm from "./about-form";
import BasicsForm, { type School } from "./basics-form";
import ConcertsEditor from "./concerts-editor";
import FavoritesEditor from "./favorites-editor";
import LinksEditor from "./links-editor";
import OpenToChips from "./open-to-chips";
import PromptForm from "./prompt-form";
import SoundForm from "./sound-form";
import StatsToggle from "./stats-toggle";

// The limits come in as props from the server page, which reads them from src/lib/profile.ts.
// That file is server-only, so importing its constants here would break the browser build.
export type EditorLimits = {
  maxFavorites: number;
  maxLinks: number;
  bioMax: number;
  displayNameMax: number;
  linkHosts: readonly string[];
};

// Every section saves by itself and shows its own result, so there is no page-wide Save
// button that could lose work when one part fails.
//
// Order: the same as the profile itself, top to bottom, so editing feels like walking down
// your own page. Each section says where it shows up. Every field is optional.
export default function ProfileEditor({
  profile,
  schools,
  limits,
  popularArtists,
}: {
  profile: FullProfile;
  schools: School[];
  limits: EditorLimits;
  popularArtists: { name: string; pictureUrl: string | null }[];
}) {
  return (
    <div className="flex flex-col gap-10">
      <AvatarUpload userId={profile.id} handle={profile.handle} currentUrl={profile.avatarUrl} />

      <Section title="Name and bio" hint="The top of your profile.">
        <BasicsForm
          userId={profile.id}
          initial={{
            displayName: profile.displayName,
            bio: profile.bio,
            classYear: profile.classYear,
            schoolId: profile.school.id,
          }}
          schools={schools}
          displayNameMax={limits.displayNameMax}
          bioMax={limits.bioMax}
        />
      </Section>

      <Section title="About you" hint="Shown in small print under your name.">
        <AboutForm
          userId={profile.id}
          initial={{
            pronouns: profile.pronouns,
            major: profile.major,
            hometown: profile.hometown,
            instagram: profile.instagram,
            studentStatus: profile.studentStatus,
          }}
        />
      </Section>

      <Section title="Genres and making music" hint="Genres show as tags under your bio. What you play shows as a line under your name.">
        <SoundForm
          userId={profile.id}
          initial={{ genres: profile.genres, musicRoles: profile.musicRoles, musicNote: profile.musicNote }}
        />
      </Section>

      <Section title="Open to" hint="Shown under your genres, and used to suggest people you might click with.">
        <OpenToChips userId={profile.id} initial={profile.openTo} />
      </Section>

      <Section title="On repeat" hint="The first thing people see after your bio: up to four covers they can play.">
        <FavoritesEditor userId={profile.id} initial={profile.favorites} max={limits.maxFavorites} />
      </Section>

      <Section title="Playlists" hint="Shown with their cover pictures, right after On repeat.">
        <LinksEditor userId={profile.id} initial={profile.links} max={limits.maxLinks} hosts={limits.linkHosts} />
      </Section>

      <Section title="Prompt" hint="One question, one answer, in large type.">
        <PromptForm userId={profile.id} initial={profile.prompt} />
      </Section>

      <Section title="Favourite artists" hint="Artists you share with a visitor are highlighted for them.">
        <ArtistPicker popular={popularArtists} initial={profile.favoriteArtists} doneLabel="Save artists" />
      </Section>

      <Section title="Concerts">
        <ConcertsEditor userId={profile.id} initial={profile.concerts} />
      </Section>

      <Section title="Listening stats" hint="Your top songs and artists, at the end of your profile.">
        <StatsToggle userId={profile.id} initial={profile.showStats} />
      </Section>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className={`text-xs uppercase tracking-wide opacity-60 ${hint ? "mb-1" : "mb-3"}`}>{title}</h2>
      {hint && <p className="mb-3 text-xs opacity-70">{hint}</p>}
      {children}
    </section>
  );
}
