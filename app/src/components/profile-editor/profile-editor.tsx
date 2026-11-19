"use client";

// Type-only import: erased at build time, so the server-only module is not bundled here.
import type { FullProfile } from "@/lib/profile";
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
// Order: quick, high-value sections first (a few taps each), so the page does not read as
// one long form; the list-style sections come last. Every field is optional.
export default function ProfileEditor({
  profile,
  schools,
  limits,
}: {
  profile: FullProfile;
  schools: School[];
  limits: EditorLimits;
}) {
  return (
    <div className="flex flex-col gap-10">
      <AvatarUpload userId={profile.id} handle={profile.handle} currentUrl={profile.avatarUrl} />

      <Section title="Basics">
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

      <Section title="About you">
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

      <Section title="Prompt">
        <PromptForm userId={profile.id} initial={profile.prompt} />
      </Section>

      <Section title="Your sound">
        <SoundForm
          userId={profile.id}
          initial={{ genres: profile.genres, musicRoles: profile.musicRoles, musicNote: profile.musicNote }}
        />
      </Section>

      <Section title="Open to">
        <OpenToChips userId={profile.id} initial={profile.openTo} />
      </Section>

      <Section title="Listening stats">
        <StatsToggle userId={profile.id} initial={profile.showStats} />
      </Section>

      <Section title="On repeat right now">
        <FavoritesEditor userId={profile.id} initial={profile.favorites} max={limits.maxFavorites} />
      </Section>

      <Section title="Playlists">
        <LinksEditor userId={profile.id} initial={profile.links} max={limits.maxLinks} hosts={limits.linkHosts} />
      </Section>

      <Section title="Concerts">
        <ConcertsEditor userId={profile.id} initial={profile.concerts} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xs uppercase tracking-wide opacity-60">{title}</h2>
      {children}
    </section>
  );
}
