"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type BlockedRow = { blocked_id: string; handle: string };

// The list of people you have blocked, with a way to undo it. Unblocking does not restore
// the friendship; either of you would have to send a new request.
export default function BlockedList({ me, rows }: { me: string; rows: BlockedRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function unblock(blockedId: string) {
    setBusyId(blockedId);
    setError(null);
    const { error } = await createClient().from("blocks").delete().eq("blocker_id", me).eq("blocked_id", blockedId);
    setBusyId(null);
    if (error) setError("Could not unblock. Try again.");
    router.refresh();
  }

  if (rows.length === 0) return <p className="text-sm opacity-60">You have not blocked anyone.</p>;

  return (
    <div>
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={r.blocked_id} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1 truncate font-medium">@{r.handle}</span>
            <button
              type="button"
              disabled={busyId !== null}
              onClick={() => unblock(r.blocked_id)}
              className="text-sm underline opacity-70"
            >
              {busyId === r.blocked_id ? "Unblocking..." : "Unblock"}
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
