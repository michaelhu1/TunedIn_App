"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// "Felt this": one tap to tell a friend their song landed. Only that friend sees it, the
// next time they open Home. No text, no counts, no read receipts. The database checks that
// the two of you are friends and that this really is the song they are showing today.
export default function FeltButton({ friendId, trackId, name, felt: initial }: { friendId: string; trackId: string; name: string; felt: boolean }) {
  const [felt, setFelt] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (felt || busy) return;
    setBusy(true);
    setFelt(true); // answer the tap at once; undo below if it did not go through
    const { data, error } = await createClient().rpc("felt_this", { p_friend: friendId, p_track: trackId });
    if (error || data !== true) setFelt(false);
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={send}
      disabled={busy}
      aria-pressed={felt}
      aria-label={felt ? `You told ${name} you felt this` : `Tell ${name} you felt this`}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        felt ? "border-accent bg-accent text-accent-foreground" : "border-foreground/20 hover:bg-foreground/5"
      }`}
    >
      {felt ? "✓ Felt" : "Felt this"}
    </button>
  );
}
