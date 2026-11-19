"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { HOMETOWN_MAX, MAJOR_MAX, PRONOUNS_MAX, STUDENT_STATUS, type StudentStatusKey } from "@/lib/profile-options";
import { normalizeInstagram, validateOptionalText } from "@/lib/profile-validation";
import SaveStatus, { useSaveState } from "./save-status";

// "" stands for no badge in the radio group; it is stored as null.
type StatusChoice = StudentStatusKey | "";
const STATUS_CHOICES: [StatusChoice, string][] = [["", "None"], ...(Object.entries(STUDENT_STATUS) as [StudentStatusKey, string][])];

// Pronouns, major, hometown, Instagram and the first-year / transfer badge: the small facts
// that give someone a way to start a conversation. One Save for the lot.
export default function AboutForm({
  userId,
  initial,
}: {
  userId: string;
  initial: {
    pronouns: string | null;
    major: string | null;
    hometown: string | null;
    instagram: string | null;
    studentStatus: StudentStatusKey | null;
  };
}) {
  const router = useRouter();
  const [pronouns, setPronouns] = useState(initial.pronouns ?? "");
  const [major, setMajor] = useState(initial.major ?? "");
  const [hometown, setHometown] = useState(initial.hometown ?? "");
  const [instagram, setInstagram] = useState(initial.instagram ? `@${initial.instagram}` : "");
  const [status, setStatus] = useState<StatusChoice>(initial.studentStatus ?? "");
  const save = useSaveState();

  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    save.reset();
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = validateOptionalText(pronouns, PRONOUNS_MAX, "Pronouns");
    if (!p.ok) return save.failed(p.error);
    const m = validateOptionalText(major, MAJOR_MAX, "Major");
    if (!m.ok) return save.failed(m.error);
    const h = validateOptionalText(hometown, HOMETOWN_MAX, "Hometown");
    if (!h.ok) return save.failed(h.error);
    const ig = normalizeInstagram(instagram);
    if (!ig.ok) return save.failed(ig.error);

    save.saving();
    const { error } = await createClient()
      .from("profiles")
      .update({
        pronouns: p.value,
        major: m.value,
        hometown: h.value,
        instagram: ig.value,
        student_status: status === "" ? null : status,
      })
      .eq("id", userId);
    if (error) {
      console.error(error);
      return save.failed(
        error.code === "23514"
          ? "Something there was not accepted. Check the lengths and the Instagram handle, then try again."
          : "Could not save. Try again.",
      );
    }
    // Show what was stored: trimmed text, and the Instagram handle in its tidy form.
    setPronouns(p.value ?? "");
    setMajor(m.value ?? "");
    setHometown(h.value ?? "");
    setInstagram(ig.value ? `@${ig.value}` : "");
    save.saved();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {/* Two short fields side by side on wider screens, so the section feels quick. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="pronouns" className="text-sm opacity-80">
            Pronouns
          </label>
          <input
            id="pronouns"
            value={pronouns}
            onChange={(e) => edit(setPronouns)(e.target.value)}
            placeholder="she/her"
            className="field"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="instagram" className="text-sm opacity-80">
            Instagram
          </label>
          <input
            id="instagram"
            value={instagram}
            onChange={(e) => edit(setInstagram)(e.target.value)}
            placeholder="@yourhandle"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby="instagram-help"
            className="field"
          />
        </div>
      </div>
      <p id="instagram-help" className="-mt-1 text-xs opacity-60">
        Your handle or a link to your profile. Only signed-in members can see it.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="major" className="text-sm opacity-80">
            Major
          </label>
          <input
            id="major"
            value={major}
            onChange={(e) => edit(setMajor)(e.target.value)}
            placeholder="Music business"
            className="field"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="hometown" className="text-sm opacity-80">
            Hometown
          </label>
          <input
            id="hometown"
            value={hometown}
            onChange={(e) => edit(setHometown)(e.target.value)}
            placeholder="Houston, TX"
            className="field"
          />
        </div>
      </div>

      {/* A real radio group (one Tab stop, arrow keys move between choices), drawn as a
          segmented control. The inputs are visually hidden but still focusable. */}
      <fieldset className="mt-2 flex flex-col gap-2">
        <legend className="mb-2 text-sm opacity-80">New to NYU this year?</legend>
        <div className="inline-flex w-fit overflow-hidden rounded-lg border border-foreground/20">
          {STATUS_CHOICES.map(([value, label]) => (
            <label
              key={value || "none"}
              className="cursor-pointer border-foreground/20 px-4 py-2 text-sm not-first:border-l hover:bg-foreground/5 has-checked:bg-foreground has-checked:text-background has-focus-visible:outline-2 has-focus-visible:-outline-offset-4 has-focus-visible:outline-current"
            >
              <input
                type="radio"
                name="student-status"
                value={value}
                checked={status === value}
                onChange={() => edit(setStatus)(value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
        <p className="text-xs opacity-60">Shows a badge on your profile so other first-years and transfers can find you.</p>
      </fieldset>

      <button type="submit" disabled={save.busy} className="btn mt-2">
        {save.busy ? "Saving..." : "Save"}
      </button>
      <SaveStatus state={save.state} />
    </form>
  );
}
