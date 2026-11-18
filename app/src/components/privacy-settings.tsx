"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// The two privacy switches. They write straight to the user's own settings row; the
// database wipes any stored location the moment either one is switched the private way.
export default function PrivacySettings({
  userId,
  shareLocation,
  ghostMode,
}: {
  userId: string;
  shareLocation: boolean;
  ghostMode: boolean;
}) {
  const router = useRouter();
  const [share, setShare] = useState(shareLocation);
  const [ghost, setGhost] = useState(ghostMode);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: { share_location?: boolean; ghost_mode?: boolean }) {
    setError(null);
    const { error } = await createClient().from("user_settings").update(patch).eq("user_id", userId);
    if (error) {
      setError("Could not save. Try again.");
      setShare(shareLocation);
      setGhost(ghostMode);
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <Toggle
        label="Share my rough location with friends"
        detail="Friends see a zone about 1 km wide, never your exact spot, and only while you have the app open. Off means friends still see your song, with no location."
        checked={share}
        onChange={(v) => {
          setShare(v);
          save({ share_location: v });
        }}
      />
      <Toggle
        label="Ghost mode"
        detail="Hide from friends completely: no song, no location. Your plays still count toward charts, without your name on the top listeners list."
        checked={ghost}
        onChange={(v) => {
          setGhost(v);
          save({ ghost_mode: v });
        }}
      />
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

function Toggle({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 accent-current"
      />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-sm opacity-60">{detail}</span>
      </span>
    </label>
  );
}
