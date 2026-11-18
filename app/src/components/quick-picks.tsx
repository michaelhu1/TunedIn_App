"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PreviewButton from "@/components/preview-button";

export type Pick = {
  trackId?: string; // set for songs already in our database
  deezerId?: number; // set for songs straight from Deezer (used for previews)
  title: string;
  artist: string;
  artworkUrl: string | null;
};

type Reward = { title: string; listenersToday: number };

// A grid of album covers. One tap checks the song in: no confirm step. Tapping another
// cover replaces it, which is the undo.
export default function QuickPicks({ sections }: { sections: { label: string; picks: Pick[] }[] }) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkIn(pick: Pick, key: string) {
    setBusyKey(key);
    setError(null);
    const res = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pick.trackId ? { trackId: pick.trackId } : { artist: pick.artist, title: pick.title }),
    });
    const body = await res.json().catch(() => ({}));
    setBusyKey(null);
    if (!res.ok) {
      setError(body.error ?? "Could not check in. Try again.");
      return;
    }
    setReward({ title: body.title ?? pick.title, listenersToday: body.listenersToday ?? 1 });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      {reward && (
        <p role="status" className="rounded-xl bg-foreground px-4 py-3 text-sm text-background">
          {reward.listenersToday > 1
            ? `You and ${reward.listenersToday - 1} other${reward.listenersToday > 2 ? "s" : ""} at NYU played ${reward.title} today.`
            : `You are the first at NYU on ${reward.title} today.`}
        </p>
      )}
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      {sections.filter((s) => s.picks.length > 0).map((section) => (
        <section key={section.label}>
          <h2 className="mb-2 text-xs uppercase tracking-wide opacity-60">{section.label}</h2>
          <ul className="grid grid-cols-3 gap-3">
            {section.picks.map((p, i) => {
              const key = `${section.label}-${i}`;
              return (
                <li key={key} className="relative">
                  <button
                    type="button"
                    disabled={busyKey !== null}
                    onClick={() => checkIn(p, key)}
                    aria-label={`Check in ${p.title} by ${p.artist}`}
                    className={`block w-full text-left transition ${busyKey === key ? "opacity-50" : ""}`}
                  >
                    <div className="aspect-square w-full overflow-hidden rounded-lg bg-foreground/10">
                      {p.artworkUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.artworkUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">{p.title}</p>
                    <p className="truncate text-xs opacity-60">{p.artist}</p>
                  </button>
                  {/* Sits on the cover's corner. A sibling of the check-in button, not inside it. */}
                  <div className="absolute right-1.5 top-1.5">
                    <PreviewButton trackId={p.trackId} deezerId={p.deezerId} className="h-8 w-8 shadow" />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

