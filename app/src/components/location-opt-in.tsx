"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// The one place people are asked to share location, with the full explanation of both
// things it is used for. Shown on the maps until the person decides.
export default function LocationOptIn({ userId }: { userId: string }) {
  const router = useRouter();
  async function turnOn() {
    await createClient().from("user_settings").update({ share_location: true }).eq("user_id", userId);
    router.refresh();
  }
  return (
    <div className="rounded-xl border border-foreground/15 p-4 text-sm">
      <p className="font-semibold">Share your rough location?</p>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 opacity-80">
        <li>Your friends see you in a zone about 1 km wide, never your exact spot.</li>
        <li>
          Everyone else never sees you. You are only counted in anonymous totals, like &quot;12 listening around
          Washington Square&quot;, and only when several people are there.
        </li>
        <li>It is read only while you have the app open, and your phone does the rounding before anything is sent.</li>
      </ul>
      <button onClick={turnOn} className="btn mt-3 block w-full">
        Share my rough location
      </button>
      <p className="mt-2 text-xs opacity-60">You can turn it off, or stay out of the anonymous totals, in Settings.</p>
    </div>
  );
}
