"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { encodeCell } from "@/lib/geo/geohash";

// Invisible. Keeps a person's rough location fresh while the app is open, so the maps
// reflect where people are now and not where they were this morning.
//
// It is only rendered for people who have turned location sharing on. It also never causes
// a permission pop-up by itself: unless `ask` is set it runs only if the browser has
// ALREADY been allowed to use location (the map screen is where that is asked for).
// As everywhere else, the exact position is rounded on the device and only the cell is sent.
let lastSent = 0;

export default function LocationPing({ ask = false }: { ask?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    if (Date.now() - lastSent < 5 * 60_000) return; // at most once every five minutes per tab

    const send = () =>
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          lastSent = Date.now();
          const cell = encodeCell(pos.coords.latitude, pos.coords.longitude);
          const res = await fetch("/api/location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cell }),
          }).catch(() => null);
          if (res?.ok) router.refresh();
        },
        () => {},
        { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 10_000 },
      );

    if (ask) {
      send();
    } else if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((p) => {
          if (p.state === "granted") send();
        })
        .catch(() => {});
    }
  }, [ask, router]);
  return null;
}
