"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { HANDLE_PATTERN } from "@/lib/validation";

export const INVITE_KEY = "tunedin:invite";
const INVITE_LIFETIME_MS = 7 * 86_400_000; // an opened invite is remembered for a week

// Runs once inside the signed-in app. If this device opened someone's invite link before
// signing up, send that person a friend request now, then forget the invite.
//
// It uses the same database rule as tapping "Add friend": a pending request from you to
// them. Nothing is accepted automatically.
export default function InviteClaim({ me, myHandle }: { me: string; myHandle: string }) {
  const router = useRouter();
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(INVITE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    // Forget it first, so a failure can never make this retry on every page.
    try {
      window.localStorage.removeItem(INVITE_KEY);
    } catch {}

    let invite: { handle?: unknown; at?: unknown };
    try {
      invite = JSON.parse(raw);
    } catch {
      return;
    }
    const handle = typeof invite.handle === "string" ? invite.handle : "";
    const at = typeof invite.at === "number" ? invite.at : 0;
    if (!HANDLE_PATTERN.test(handle) || handle === myHandle || Date.now() - at > INVITE_LIFETIME_MS) return;

    (async () => {
      const supabase = createClient();
      const { data: inviter } = await supabase.from("profiles").select("id").eq("handle", handle).maybeSingle();
      if (!inviter) return;
      const { error } = await supabase.from("friendships").insert({ requester_id: me, addressee_id: inviter.id });
      // 23505 = you two already have a request or friendship, which is fine.
      if (!error) {
        setSentTo(handle);
        router.refresh();
      }
    })();
  }, [me, myHandle, router]);

  if (!sentTo) return null;
  return (
    <p role="status" className="mb-4 rounded-xl bg-foreground px-4 py-3 text-sm text-background">
      Friend request sent to @{sentTo}, who invited you. You will see their music once they accept.
    </p>
  );
}
