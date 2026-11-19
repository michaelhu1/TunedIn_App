"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// "Felt this": one tap to tell a friend their song landed. Only that friend sees it, the
// next time they open Home. No text, no counts, no read receipts. Tapping again takes it
// back. The database checks that the two of you are friends and that this really is the
// song they are showing today.
export default function FeltButton({ friendId, trackId, name, felt: initial }: { friendId: string; trackId: string; name: string; felt: boolean }) {
  const [felt, setFelt] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const next = !felt;
    setFelt(next); // answer the tap at once; undo below if it did not go through
    const supabase = createClient();
    let ok: boolean;
    if (next) {
      const { data, error } = await supabase.rpc("felt_this", { p_friend: friendId, p_track: trackId });
      ok = !error && data === true;
    } else {
      const { data: me } = await supabase.auth.getUser();
      const { error } = me.user
        ? await supabase.from("song_reactions").delete().eq("sender_id", me.user.id).eq("receiver_id", friendId).eq("track_id", trackId)
        : { error: new Error("signed out") };
      ok = !error;
    }
    if (!ok) {
      setFelt(!next);
      setFailed(true);
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={felt}
      aria-label={felt ? `You told ${name} you felt this. Tap to take it back` : `Tell ${name} you felt this`}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        felt ? "border-accent bg-accent text-accent-foreground" : failed ? "border-danger text-danger" : "border-foreground/20 hover:bg-foreground/5"
      }`}
    >
      {felt ? "✓ Felt" : failed ? "Try again" : "Felt this"}
      {failed && <span role="alert" className="sr-only">That did not go through.</span>}
    </button>
  );
}
