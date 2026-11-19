"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Invisible. When a screen that shows plays opens, this asks the server to pull fresh plays
// from Last.fm (yours, and a few friends'), then redraws the screen. While the screen stays
// open and visible it does the same again every minute, so Home keeps up with what friends
// are playing without anyone pulling to refresh. Nothing runs while the tab is hidden.
const EVERY_MS = 60_000;
let lastRun = 0;

export default function AutopilotSync() {
  const router = useRouter();
  useEffect(() => {
    let stopped = false;
    async function run(first: boolean) {
      if (stopped || document.visibilityState !== "visible") return;
      // At most once a minute per browser tab, so flipping between screens does not spam it.
      if (Date.now() - lastRun < EVERY_MS - 1000) return;
      lastRun = Date.now();
      const body = await fetch("/api/lastfm/sync", { method: "POST" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (stopped) return;
      // On opening, redraw only if something new arrived (the page is already fresh). On the
      // later ticks always redraw: friends' songs are also updated by the scheduled reader,
      // which this request knows nothing about.
      if (!first || body?.changed) router.refresh();
    }
    run(true);
    const timer = setInterval(() => run(false), EVERY_MS);
    const onVisible = () => run(false);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);
  return null;
}
