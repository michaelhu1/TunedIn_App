"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Invisible. When a screen that shows plays opens, this asks the server to pull fresh plays
// from Last.fm (yours, and a few friends'), then redraws the screen if anything changed.
// It runs at most once a minute per browser tab so flipping between tabs does not spam it.
let lastRun = 0;

export default function AutopilotSync() {
  const router = useRouter();
  useEffect(() => {
    if (Date.now() - lastRun < 60_000) return;
    lastRun = Date.now();
    fetch("/api/lastfm/sync", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body?.changed) router.refresh();
      })
      .catch(() => {});
  }, [router]);
  return null;
}
