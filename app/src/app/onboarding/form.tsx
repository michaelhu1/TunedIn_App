"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { HANDLE_PATTERN } from "@/lib/validation";

type School = { id: string; name: string; short_name: string };

export default function OnboardingForm({
  userId,
  schools,
  suggestedHandle = "",
}: {
  userId: string;
  schools: School[];
  /** A starting point taken from the email address, so most people do not have to type one. */
  suggestedHandle?: string;
}) {
  const router = useRouter();
  const [handle, setHandle] = useState(suggestedHandle);
  const [schoolId, setSchoolId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!HANDLE_PATTERN.test(handle)) {
      setError("Handles are 3 to 20 characters: lowercase letters, numbers and underscores.");
      return;
    }
    if (!schoolId) {
      setError("Pick your school.");
      return;
    }
    setBusy(true);
    // The database fills in the university from the verified email and rejects
    // a school from another university, so nothing here needs to be trusted.
    const { error } = await createClient()
      .from("profiles")
      .insert({ id: userId, handle, school_id: schoolId });
    setBusy(false);
    if (error) {
      // 23505 is Postgres for "unique constraint violated".
      setError(
        error.code === "23505"
          ? "That handle is taken. Try another."
          : "Could not save your profile. Try again.",
      );
      return;
    }
    router.replace("/welcome");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label htmlFor="handle" className="text-sm opacity-80">Handle</label>
      <div className="field flex items-center gap-1">
        <span className="opacity-50">@</span>
        <input
          id="handle"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          maxLength={20}
          placeholder="yourname"
          value={handle}
          onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
          className="w-full bg-transparent outline-none"
        />
      </div>

      <label htmlFor="school" className="mt-2 text-sm opacity-80">School</label>
      <select
        id="school"
        required
        value={schoolId}
        onChange={(e) => setSchoolId(e.target.value)}
        className="field"
      >
        <option value="" disabled>Pick your school</option>
        {schools.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>

      <button type="submit" disabled={busy} className="btn mt-2">
        {busy ? "Saving..." : "Continue"}
      </button>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </form>
  );
}
