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
  countMeNearby,
}: {
  userId: string;
  shareLocation: boolean;
  ghostMode: boolean;
  countMeNearby: boolean;
}) {
  const router = useRouter();
  const [share, setShare] = useState(shareLocation);
  const [ghost, setGhost] = useState(ghostMode);
  const [nearby, setNearby] = useState(countMeNearby);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: { share_location?: boolean; ghost_mode?: boolean; count_me_nearby?: boolean }) {
    setError(null);
    const { error } = await createClient().from("user_settings").update(patch).eq("user_id", userId);
    if (error) {
      setError("Could not save. Try again.");
      setShare(shareLocation);
      setGhost(ghostMode);
      setNearby(countMeNearby);
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <Toggle
        label="Share my rough location"
        detail="Friends see you in a zone about 1 km wide, never your exact spot. Everyone else only sees anonymous totals for busy areas. Read only while the app is open. Off means friends still see your song, with no location."
        checked={share}
        onChange={(v) => {
          setShare(v);
          save({ share_location: v });
        }}
      />
      {share && (
        <Toggle
          label="Count me in public area totals"
          detail="Adds you, without your name, to numbers like &quot;12 listening around Washington Square&quot; on the public map. Areas only show with several people in them. Turn off to appear to friends only."
          checked={nearby}
          onChange={(v) => {
            setNearby(v);
            save({ count_me_nearby: v });
          }}
        />
      )}
      <Toggle
        label="Ghost mode"
        detail="Hide completely: no song or location for friends, and not counted on the public map. Your plays still count toward charts, without your name on the top listeners list."
        checked={ghost}
        onChange={(v) => {
          setGhost(v);
          save({ ghost_mode: v });
        }}
      />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
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
