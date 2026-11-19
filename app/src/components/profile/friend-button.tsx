"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Where the viewer stands with this person, worked out on the server from `my_friendships`. */
export type FriendState = "none" | "requested" | "incoming" | "friends";

// The same queries as the Friends screen (src/app/(app)/friends/manager.tsx). They run in the
// browser as the viewer, and row-level security decides what is allowed.
//
// The state comes in as a prop and is never copied into local state: after each action we
// call router.refresh(), the server reads `my_friendships` again, and the new state arrives
// as a new prop. That way the button can never drift from what the database says.
export default function FriendButton({ me, friendId, handle, state }: { me: string; friendId: string; handle: string; state: FriendState }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    const problem = await action().catch(() => "Something went wrong. Try again.");
    setBusy(false);
    setConfirming(false);
    if (problem) setError(problem);
    router.refresh();
  }

  const add = () =>
    run(async () => {
      const { error } = await supabase.from("friendships").insert({ requester_id: me, addressee_id: friendId });
      // 23505 = a row for this pair already exists (they may have just asked you). The refresh
      // below shows the real state, so this is not worth an error message.
      if (error && error.code !== "23505") return "Could not send the request. Try again.";
      return null;
    });

  const accept = () =>
    run(async () => {
      const { error } = await supabase
        .from("friendships")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("requester_id", friendId)
        .eq("addressee_id", me);
      return error ? "Could not accept. Try again." : null;
    });

  // Cancel, decline and unfriend are all the same thing: delete the row for this pair.
  const remove = () =>
    run(async () => {
      const { error } = await supabase
        .from("friendships")
        .delete()
        .or(`and(requester_id.eq.${me},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${me})`);
      return error ? "Could not update. Try again." : null;
    });

  const secondary = "rounded-lg border border-foreground/20 px-4 py-2 text-sm font-semibold disabled:opacity-50";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {state === "none" && (
          <button type="button" disabled={busy} onClick={add} className="btn px-5 py-2 text-sm">
            Add friend
          </button>
        )}

        {state === "requested" && (
          // Cancelling a request is harmless (you can just ask again), so it is one tap.
          <button type="button" disabled={busy} onClick={remove} aria-label={`Cancel friend request to @${handle}`} className={secondary}>
            Requested · Cancel
          </button>
        )}

        {state === "incoming" && (
          <>
            <button type="button" disabled={busy} onClick={accept} className="btn px-5 py-2 text-sm">
              Accept request
            </button>
            <button type="button" disabled={busy} onClick={remove} className="text-sm underline opacity-70">
              Decline
            </button>
          </>
        )}

        {/* Unfriending is the one action that is awkward to undo (they would have to accept
            again), so it takes two taps: "Friends" opens the choice, then "Remove". */}
        {state === "friends" &&
          (confirming ? (
            <>
              <span className="text-sm">Remove @{handle} as a friend?</span>
              <button type="button" disabled={busy} onClick={remove} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Remove
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="text-sm underline opacity-70">
                Keep
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} aria-label={`Friends with @${handle}. Options`} className={secondary}>
              ✓ Friends
            </button>
          ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
