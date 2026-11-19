"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { charLength, classYearOptions, parseClassYear, validateOptionalText, blockedWordMessage } from "@/lib/profile-validation";
import SaveStatus, { useSaveState } from "./save-status";

export type School = { id: string; name: string };

// Display name, bio, class year and school. Written straight to the user's own profile row:
// the database only lets an owner change a fixed list of columns, and its checks and
// triggers (lengths, school belongs to your university) still apply.
export default function BasicsForm({
  userId,
  initial,
  schools,
  displayNameMax,
  bioMax,
}: {
  userId: string;
  initial: { displayName: string | null; bio: string | null; classYear: number | null; schoolId: string };
  schools: School[];
  displayNameMax: number;
  bioMax: number;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.displayName ?? "");
  const [bio, setBio] = useState(initial.bio ?? "");
  const [classYear, setClassYear] = useState(initial.classYear === null ? "" : String(initial.classYear));
  const [schoolId, setSchoolId] = useState(initial.schoolId);
  const save = useSaveState();

  // Computed once per visit; the list does not need to change while the page is open.
  const years = useMemo(() => classYearOptions(new Date(), initial.classYear), [initial.classYear]);
  const bioLength = charLength(bio.trim());

  // Wrap each setter so that editing clears an old "Saved" or error.
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    save.reset();
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = validateOptionalText(displayName, displayNameMax, "Display name");
    if (!name.ok) return save.failed(name.error);
    const about = validateOptionalText(bio, bioMax, "Bio");
    if (!about.ok) return save.failed(about.error);
    const year = parseClassYear(classYear);
    if (!year.ok) return save.failed(year.error);
    if (!schoolId) return save.failed("Pick your school.");

    save.saving();
    const { error } = await createClient()
      .from("profiles")
      .update({ display_name: name.value, bio: about.value, class_year: year.value, school_id: schoolId })
      .eq("id", userId);
    if (error) {
      console.error(error);
      const wording = blockedWordMessage(error);
      if (wording) return save.failed(wording);
      // 23514 = a check constraint said no. Our checks above mirror them, so this should
      // only happen if the rules change; the message stays general on purpose.
      return save.failed(error.code === "23514" ? "Something there is too long. Shorten it and try again." : "Could not save. Try again.");
    }
    // Show the trimmed values that were actually stored.
    setDisplayName(name.value ?? "");
    setBio(about.value ?? "");
    save.saved();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label htmlFor="display-name" className="text-sm opacity-80">
        Display name <span className="opacity-60">(optional)</span>
      </label>
      <input
        id="display-name"
        value={displayName}
        onChange={(e) => edit(setDisplayName)(e.target.value)}
        placeholder="What friends call you"
        autoComplete="nickname"
        className="field"
      />

      <div className="mt-2 flex items-baseline justify-between">
        <label htmlFor="bio" className="text-sm opacity-80">
          Bio <span className="opacity-60">(optional)</span>
        </label>
        {/* Counts characters the way the database does, so emoji count as one. */}
        <span id="bio-count" className={`text-xs ${bioLength > bioMax ? "text-danger" : "opacity-60"}`}>
          {bioLength}/{bioMax}
        </span>
      </div>
      <textarea
        id="bio"
        rows={3}
        value={bio}
        onChange={(e) => edit(setBio)(e.target.value)}
        aria-describedby="bio-count"
        placeholder="What you are into right now"
        className="field resize-none"
      />

      <label htmlFor="class-year" className="mt-2 text-sm opacity-80">
        Class year <span className="opacity-60">(optional)</span>
      </label>
      <select id="class-year" value={classYear} onChange={(e) => edit(setClassYear)(e.target.value)} className="field">
        <option value="">Not shown</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>

      <label htmlFor="school" className="mt-2 text-sm opacity-80">
        School
      </label>
      <select id="school" required value={schoolId} onChange={(e) => edit(setSchoolId)(e.target.value)} className="field">
        {schools.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {/* Charts look up each listener's current school, so a change applies to past plays too. */}
      <p className="text-xs opacity-60">
        Your school decides which school charts your plays count toward, including plays from before a change.
      </p>

      <button type="submit" disabled={save.busy} className="btn mt-2">
        {save.busy ? "Saving..." : "Save"}
      </button>
      <SaveStatus state={save.state} />
    </form>
  );
}
