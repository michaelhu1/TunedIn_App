"use client";

import { useEffect } from "react";
import { INVITE_KEY } from "@/components/invite-claim";

// Remembers, on this device only, whose invite link was opened, so the friend request can
// be sent once the person has finished signing up.
export default function RememberInvite({ handle }: { handle: string }) {
  useEffect(() => {
    try {
      window.localStorage.setItem(INVITE_KEY, JSON.stringify({ handle, at: Date.now() }));
    } catch {
      // Private browsing can block storage. The person can still add their friend by handle.
    }
  }, [handle]);
  return null;
}
