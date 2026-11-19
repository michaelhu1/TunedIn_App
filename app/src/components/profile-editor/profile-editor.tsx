"use client";

import Link from "next/link";
import { EDITOR_TABS, type EditorTab } from "./tabs";
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
// The editor is split into three short pages (You, Music taste, Showcase), each in the same
// order as the profile itself. One rule for saving everywhere: a tap saves at once, typed
// text has a Save button. Each section says where it shows up. Every field is optional.
export default function ProfileEditor({
  profile,
  schools,
  limits,
  popularArtists,
  tab,
}: {
  profile: FullProfile;
  schools: School[];
  limits: EditorLimits;
  popularArtists: { name: string; pictureUrl: string | null }[];
  tab: EditorTab;
}) {
  return (
    <div className="flex flex-col gap-8">
      {/* Three short pages instead of one long form. Each section still saves by itself. */}
      <nav aria-label="Edit profile sections" className="sticky top-0 z-10 -mx-5 flex gap-2 bg-background/95 px-5 py-2 backdrop-blur">
        {EDITOR_TABS.map((t) => (
          <Link
            key={t.id}
            href={`/me/edit?tab=${t.id}`}
            replace
            scroll={false}
            aria-current={t.id === tab ? "page" : undefined}
            className={`flex-1 rounded-full border px-3 py-2 text-center text-sm font-semibold ${
              t.id === tab ? "border-accent bg-accent text-accent-foreground" : "border-foreground/20"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <p className="-mt-4 text-xs opacity-70">Anything you tap saves right away. Anything you type has a Save button under it.</p>

      {tab === "you" && (
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
        </div>
      )}

      {tab === "music" && (
        <div className="flex flex-col gap-10">
          <Section title="Genres and making music" hint="Genres show as tags under your bio. What you play shows as a line under your name.">
            <SoundForm
              userId={profile.id}
              initial={{ genres: profile.genres, musicRoles: profile.musicRoles, musicNote: profile.musicNote }}
            />
          </Section>

          <Section title="Open to" hint="Shown under your genres, and used to suggest people you might click with.">
            <OpenToChips userId={profile.id} initial={profile.openTo} />
          </Section>

          <Section title="Favourite artists" hint="Artists you share with a visitor are highlighted for them.">
            <ArtistPicker popular={popularArtists} initial={profile.favoriteArtists} autoSave />
          </Section>

          <Section title="Listening stats" hint="Your top songs and artists, at the end of your profile.">
            <StatsToggle userId={profile.id} initial={profile.showStats} />
          </Section>
        </div>
      )}

      {tab === "showcase" && (
        <div className="flex flex-col gap-10">
          <Section title="On repeat" hint="The first thing people see after your bio: up to four covers they can play.">
            <FavoritesEditor userId={profile.id} initial={profile.favorites} max={limits.maxFavorites} />
          </Section>

          <Section title="Playlists" hint="Shown with their cover pictures, right after On repeat.">
            <LinksEditor userId={profile.id} initial={profile.links} max={limits.maxLinks} hosts={limits.linkHosts} />
          </Section>

          <Section title="Prompt" hint="One question, one answer, in large type.">
            <PromptForm userId={profile.id} initial={profile.prompt} />
          </Section>

          <Section title="Concerts">
            <ConcertsEditor userId={profile.id} initial={profile.concerts} />
          </Section>
        </div>
      )}
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
