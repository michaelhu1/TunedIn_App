"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SaveStatus, { useSaveState } from "./save-status";

// The show_stats switch. Saves the moment it is flipped, like the privacy switches on the
// Me tab, and flips back if the save fails so the switch never lies about what is stored.
export default function StatsToggle({ userId, initial }: { userId: string; initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const save = useSaveState();

  async function change(next: boolean) {
    setOn(next);
    save.saving();
    const { error } = await createClient().from("profiles").update({ show_stats: next }).eq("id", userId);
    if (error) {
      console.error(error);
      setOn(!next);
      return save.failed("Could not save. Try again.");
    }
    save.saved();
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          role="switch"
          checked={on}
          disabled={save.busy}
          onChange={(e) => change(e.target.checked)}
          className="mt-1 h-5 w-5 accent-current"
        />
        <span>
          <span className="block font-medium">Show my top songs and artists on my profile</span>
          <span className="block text-sm opacity-60">
            Based on your last 90 days of listening. Ghost mode always hides them, whatever this says.
          </span>
        </span>
      </label>
      <SaveStatus state={save.state} />
    </div>
  );
}
