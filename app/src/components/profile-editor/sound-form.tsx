"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GENRES, MAX_GENRES, MUSIC_NOTE_MAX, MUSIC_ROLES, type MusicRoleKey } from "@/lib/profile-options";
import { blockedWordMessage, charLength, toggleChoice, validateOptionalText } from "@/lib/profile-validation";
import { ChipGroup } from "./chips";
import SaveStatus, { useSaveState } from "./save-status";

type Genre = (typeof GENRES)[number];
// Genres are stored as the lowercase tag itself, so the tag doubles as its label.
const GENRE_OPTIONS = GENRES.map((g) => [g, g] as const);
const ROLE_KEYS = Object.keys(MUSIC_ROLES) as MusicRoleKey[];
const ROLE_OPTIONS = Object.entries(MUSIC_ROLES) as [MusicRoleKey, string][];

// Genre tags (up to MAX_GENRES), how you make music, and a short note about it.
//
// The editor has one rule for saving: anything you TAP saves right away, anything you TYPE
// has a Save button. So the two sets of tags here save on each tap, and only the note
// underneath has a button.
export default function SoundForm({
  userId,
  initial,
}: {
  userId: string;
  initial: { genres: string[]; musicRoles: MusicRoleKey[]; musicNote: string | null };
}) {
  const router = useRouter();
  // Drop any stored choice that is no longer in the lists, so it cannot block saving.
  const [genres, setGenres] = useState<Genre[]>(() => GENRES.filter((g) => initial.genres.includes(g)));
  const [roles, setRoles] = useState<MusicRoleKey[]>(() => ROLE_KEYS.filter((r) => initial.musicRoles.includes(r)));
  const [note, setNote] = useState(initial.musicNote ?? "");
  const tags = useSaveState();
  const noteSave = useSaveState();
  const noteLength = charLength(note.trim());

  // Tags are disabled while a save is in flight, so two saves never race and a failed one
  // can always be put back.
  async function saveTags(next: { genres: Genre[]; roles: MusicRoleKey[] }) {
    const before = { genres, roles };
    setGenres(next.genres);
    setRoles(next.roles);
    tags.saving();
    const { error } = await createClient().from("profiles").update({ genres: next.genres, music_roles: next.roles }).eq("id", userId);
    if (error) {
      console.error(error);
      setGenres(before.genres);
      setRoles(before.roles);
      return tags.failed(error.code === "23514" ? `Pick up to ${MAX_GENRES} genres.` : "Could not save. Try again.");
    }
    tags.saved();
    router.refresh();
  }

  async function submitNote(e: React.FormEvent) {
    e.preventDefault();
    const n = validateOptionalText(note, MUSIC_NOTE_MAX, "The note");
    if (!n.ok) return noteSave.failed(n.error);
    noteSave.saving();
    const { error } = await createClient().from("profiles").update({ music_note: n.value }).eq("id", userId);
    if (error) {
      console.error(error);
      const wording = blockedWordMessage(error);
      return noteSave.failed(wording ?? (error.code === "23514" ? "Keep the note short." : "Could not save. Try again."));
    }
    setNote(n.value ?? "");
    noteSave.saved();
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <ChipGroup
        id="genres"
        label="Genres"
        options={GENRE_OPTIONS}
        selected={genres}
        max={MAX_GENRES}
        limitHint={`That is ${MAX_GENRES}. Tap one to remove it and pick another.`}
        disabled={tags.busy}
        onToggle={(g) => saveTags({ genres: toggleChoice(genres, g, GENRES, MAX_GENRES), roles })}
      />

      <ChipGroup
        id="music-roles"
        label="Do you make music?"
        options={ROLE_OPTIONS}
        selected={roles}
        disabled={tags.busy}
        onToggle={(r) => saveTags({ genres, roles: toggleChoice(roles, r, ROLE_KEYS) })}
      />
      <SaveStatus state={tags.state} />

      <form onSubmit={submitNote} className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="music-note" className="text-sm opacity-80">
            Anything to add about making music?
          </label>
          <span id="music-note-count" className={`text-xs ${noteLength > MUSIC_NOTE_MAX ? "text-danger" : "opacity-60"}`}>
            {noteLength}/{MUSIC_NOTE_MAX}
          </span>
        </div>
        <input
          id="music-note"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            noteSave.reset();
          }}
          aria-describedby="music-note-count"
          placeholder="Bass in a shoegaze band, looking for a drummer"
          className="field"
        />
        <button type="submit" disabled={noteSave.busy} className="btn">
          {noteSave.busy ? "Saving..." : "Save note"}
        </button>
        <SaveStatus state={noteSave.state} />
      </form>
    </div>
  );
}
