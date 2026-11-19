"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GENRES, MAX_GENRES, MUSIC_NOTE_MAX, MUSIC_ROLES, type MusicRoleKey } from "@/lib/profile-options";
import { charLength, toggleChoice, validateOptionalText } from "@/lib/profile-validation";
import { ChipGroup } from "./chips";
import SaveStatus, { useSaveState } from "./save-status";

type Genre = (typeof GENRES)[number];
// Genres are stored as the lowercase tag itself, so the tag doubles as its label.
const GENRE_OPTIONS = GENRES.map((g) => [g, g] as const);
const ROLE_KEYS = Object.keys(MUSIC_ROLES) as MusicRoleKey[];
const ROLE_OPTIONS = Object.entries(MUSIC_ROLES) as [MusicRoleKey, string][];

// Genre tags (up to MAX_GENRES), how you make music, and a short note about it. Chips only
// change local state; nothing is stored until Save, so you can tap around freely.
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
  const save = useSaveState();
  const noteLength = charLength(note.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = validateOptionalText(note, MUSIC_NOTE_MAX, "The note");
    if (!n.ok) return save.failed(n.error);

    save.saving();
    const { error } = await createClient()
      .from("profiles")
      .update({ genres, music_roles: roles, music_note: n.value })
      .eq("id", userId);
    if (error) {
      console.error(error);
      return save.failed(
        error.code === "23514"
          ? `That was not accepted. Pick up to ${MAX_GENRES} genres and keep the note short.`
          : "Could not save. Try again.",
      );
    }
    setNote(n.value ?? "");
    save.saved();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <ChipGroup
        id="genres"
        label="Genres"
        options={GENRE_OPTIONS}
        selected={genres}
        max={MAX_GENRES}
        limitHint={`That is ${MAX_GENRES}. Tap one to remove it and pick another.`}
        onToggle={(g) => {
          setGenres((list) => toggleChoice(list, g, GENRES, MAX_GENRES));
          save.reset();
        }}
      />

      <ChipGroup
        id="music-roles"
        label="Do you make music?"
        options={ROLE_OPTIONS}
        selected={roles}
        onToggle={(r) => {
          setRoles((list) => toggleChoice(list, r, ROLE_KEYS));
          save.reset();
        }}
      />

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="music-note" className="text-sm opacity-80">
            Anything to add?
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
            save.reset();
          }}
          aria-describedby="music-note-count"
          placeholder="Bass in a shoegaze band, looking for a drummer"
          className="field"
        />
      </div>

      <button type="submit" disabled={save.busy} className="btn">
        {save.busy ? "Saving..." : "Save"}
      </button>
      <SaveStatus state={save.state} />
    </form>
  );
}
