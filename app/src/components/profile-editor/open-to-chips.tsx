"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { OPEN_TO, type OpenToKey } from "@/lib/profile-options";
import { toggleChoice } from "@/lib/profile-validation";
import { ChipGroup } from "./chips";
import SaveStatus, { useSaveState } from "./save-status";

const KEYS = Object.keys(OPEN_TO) as OpenToKey[];
const OPTIONS = Object.entries(OPEN_TO) as [OpenToKey, string][];

// What you are open to. Saves on every tap, like the stats switch, because this is the
// signal that it is fine to reach out, and it should never sit unsaved. If a save fails
// the chips go back to what is stored, so they never show something the database lacks.
export default function OpenToChips({ userId, initial }: { userId: string; initial: OpenToKey[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<OpenToKey[]>(() => KEYS.filter((k) => initial.includes(k)));
  const save = useSaveState();

  async function toggle(key: OpenToKey) {
    const before = selected;
    const next = toggleChoice(before, key, KEYS);
    setSelected(next);
    save.saving();
    // The chips are disabled while saving (save.busy), so two saves never race and the
    // revert below always goes back to the right list.
    const { error } = await createClient().from("profiles").update({ open_to: next }).eq("id", userId);
    if (error) {
      console.error(error);
      setSelected(before);
      return save.failed("Could not save. Try again.");
    }
    save.saved();
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <ChipGroup
        id="open-to"
        label="I am open to"
        help="Lets people know it is fine to reach out to you about these."
        options={OPTIONS}
        selected={selected}
        disabled={save.busy}
        onToggle={toggle}
      />
      <SaveStatus state={save.state} />
    </div>
  );
}
