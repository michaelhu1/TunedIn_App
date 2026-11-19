"use client";

// Type-only import: erased at build time, so the server-only module is not bundled here.
import type { FullProfile } from "@/lib/profile";
import AvatarUpload from "@/components/profile-editor/avatar-upload";
import BasicsForm, { type School } from "./basics-form";
import FavoritesEditor from "./favorites-editor";
import LinksEditor from "./links-editor";
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

      <Section title="Listening stats">
        <StatsToggle userId={profile.id} initial={profile.showStats} />
      </Section>

      <Section title="On repeat right now">
        <FavoritesEditor userId={profile.id} initial={profile.favorites} max={limits.maxFavorites} />
      </Section>

      <Section title="Playlists">
        <LinksEditor userId={profile.id} initial={profile.links} max={limits.maxLinks} hosts={limits.linkHosts} />
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
