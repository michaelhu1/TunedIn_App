"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Cover from "@/components/cover";
import OpenInSpotify from "@/components/open-in-spotify";
import PreviewButton from "@/components/preview-button";
import { cellBounds, cellCenter, encodeCell } from "@/lib/geo/geohash";
import { createClient } from "@/lib/supabase/client";

export type MapPerson = {
  userId: string;
  handle: string;
  isMe: boolean;
  cell: string | null; // null = sharing music but not location
  updatedAt: string;
  track: { id: string; title: string; artist: string; artworkUrl: string | null } | null;
};

const LIVE_MINUTES = 30;
const NYU: [number, number] = [-73.9965, 40.7295]; // Washington Square, [lon, lat]
// OpenFreeMap: free, open-source map tiles with no API key or usage billing.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

const isLive = (p: MapPerson) => Date.now() - new Date(p.updatedAt).getTime() < LIVE_MINUTES * 60000;
function ago(iso: string) {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
}

export default function MapView({
  myId,
  people,
  friendCount,
  shareLocation,
  ghostMode,
}: {
  myId: string;
  people: MapPerson[];
  friendCount: number;
  shareLocation: boolean;
  ghostMode: boolean;
}) {
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locationNote, setLocationNote] = useState<string | null>(null);

  const placed = useMemo(() => people.filter((p) => p.cell), [people]);
  const unplaced = useMemo(() => people.filter((p) => !p.cell && !p.isMe && p.track), [people]);
  const selected = people.find((p) => p.userId === selectedId) ?? null;
  const sharing = shareLocation && !ghostMode;

  // Send my rounded cell while the map is open. The exact fix stays in this function:
  // only the 6-character cell goes over the network.
  function sendMyCell() {
    if (!("geolocation" in navigator)) {
      setLocationNote("This browser cannot share location.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const cell = encodeCell(pos.coords.latitude, pos.coords.longitude);
        await fetch("/api/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cell }),
        });
        setLocationNote(null);
        router.refresh();
      },
      () => setLocationNote("Location is blocked for this site. Allow it in your browser settings to appear on the map."),
      { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 10_000 },
    );
  }

  useEffect(() => {
    if (sharing) sendMyCell();
    // Run once when the map opens (or when sharing is switched on).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing]);

  async function turnOnSharing() {
    await createClient().from("user_settings").update({ share_location: true }).eq("user_id", myId);
    router.refresh();
  }

  // Create the map once. maplibre-gl is loaded here so it never runs on the server.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      // Served from public/ (see scripts/copy-map-worker.mjs).
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
      const map = new maplibregl.Map({
        container: container.current,
        style: MAP_STYLE,
        center: NYU,
        zoom: 12.5,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      // "style.load" fires as soon as the map style is in, before every tile has drawn,
      // so friends appear without waiting on a slow connection.
      map.once("style.load", () => {
        // One translucent rectangle per occupied cell: it shows the zone someone is in,
        // which is all we know, instead of pretending to know a point.
        map.addSource("cells", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "cells-fill", type: "fill", source: "cells", paint: { "fill-color": "#6d28d9", "fill-opacity": 0.12 } });
        map.addLayer({ id: "cells-line", type: "line", source: "cells", paint: { "line-color": "#6d28d9", "line-opacity": 0.4, "line-width": 1 } });
        mapRef.current = map;
        setReady(true);
      });
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw pins whenever the people change.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    let cancelled = false;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled) return;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      const byCell = new Map<string, MapPerson[]>();
      for (const p of placed) byCell.set(p.cell!, [...(byCell.get(p.cell!) ?? []), p]);

      const features = [...byCell.keys()].map((cell) => {
        const b = cellBounds(cell);
        return {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "Polygon" as const,
            coordinates: [[[b.west, b.south], [b.east, b.south], [b.east, b.north], [b.west, b.north], [b.west, b.south]]],
          },
        };
      });
      (map.getSource("cells") as GeoJSONSource).setData({ type: "FeatureCollection", features });

      for (const [cell, group] of byCell) {
        const center = cellCenter(cell);
        group.forEach((p, i) => {
          // Several friends in one zone are fanned out in a small ring so every pin is tappable.
          const angle = (2 * Math.PI * i) / group.length;
          const r = group.length > 1 ? 26 : 0; // pixels, so the ring looks the same at any zoom
          const el = document.createElement("button");
          el.type = "button";
          el.setAttribute("aria-label", `${p.isMe ? "You" : "@" + p.handle}${p.track ? `: ${p.track.title}` : ""}`);
          el.className = `tunedin-pin${isLive(p) && p.track ? " live" : ""}${p.isMe ? " me" : ""}`;
          if (p.track?.artworkUrl) el.style.backgroundImage = `url("${p.track.artworkUrl}")`;
          el.textContent = p.track?.artworkUrl ? "" : (p.isMe ? "you" : p.handle.slice(0, 2));
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            setSelectedId(p.userId);
          });
          markersRef.current.push(
            new maplibregl.Marker({ element: el, offset: [r * Math.cos(angle), r * Math.sin(angle)] })
              .setLngLat([center.lon, center.lat])
              .addTo(map),
          );
        });
      }

      // Frame everyone, or stay on campus if nobody is placed.
      if (placed.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        for (const cell of byCell.keys()) {
          const b = cellBounds(cell);
          bounds.extend([b.west, b.south]).extend([b.east, b.north]);
        }
        map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, placed]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative -mx-5 overflow-hidden sm:mx-0 sm:rounded-xl">
        <div ref={container} className="h-[52vh] w-full bg-foreground/5" aria-label="Map of friends" />
      </div>

      {selected && <PersonCard person={selected} onClose={() => setSelectedId(null)} />}

      {ghostMode ? (
        <Notice>Ghost mode is on. Friends cannot see you. Change it under Me.</Notice>
      ) : !shareLocation ? (
        <Notice>
          <span className="font-semibold">Show up on your friends&apos; maps?</span> They see a zone about 1 km wide, never your
          exact spot, and only while you have the app open. Your device does the rounding before anything is sent.
          <button onClick={turnOnSharing} className="btn mt-3 block w-full">Share my rough location</button>
        </Notice>
      ) : (
        locationNote && <Notice>{locationNote}</Notice>
      )}

      {friendCount === 0 && (
        <Notice>
          The map shows your friends, and you have none here yet.{" "}
          <Link href="/friends" className="underline">Add friends</Link>
        </Notice>
      )}

      {unplaced.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs uppercase tracking-wide opacity-60">Listening, location hidden</h2>
          <ul className="flex flex-col">
            {unplaced.map((p) => (
              <li key={p.userId}>
                <button onClick={() => setSelectedId(p.userId)} className="flex w-full items-center gap-3 py-2 text-left">
                  <Cover src={p.track!.artworkUrl} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">@{p.handle}</span>
                    <span className="block truncate text-sm opacity-70">{p.track!.title} · {p.track!.artist}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Pin styles live here because MapLibre creates the pins outside React. */}
      <style>{`
        .tunedin-pin {
          width: 44px; height: 44px; border-radius: 9999px; border: 3px solid #fff;
          background: #6d28d9 center / cover no-repeat; color: #fff; font-size: 11px; font-weight: 700;
          box-shadow: 0 2px 8px rgba(0,0,0,.35); cursor: pointer; opacity: .75;
        }
        .tunedin-pin.live { opacity: 1; border-color: #22c55e; }
        .tunedin-pin.me { border-style: dashed; }
      `}</style>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-foreground/15 p-4 text-sm">{children}</div>;
}

function PersonCard({ person, onClose }: { person: MapPerson; onClose: () => void }) {
  const track = person.track;
  const q = track ? encodeURIComponent(`${track.artist} ${track.title}`) : "";

  return (
    <section className="rounded-xl border border-foreground/15 p-4">
      <div className="flex items-start gap-3">
        <Cover src={track?.artworkUrl ?? null} size={64} />
        <div className="min-w-0 flex-1">
          <p className="text-xs opacity-60">
            {person.isMe ? "You" : <Link href={"/u/" + person.handle} className="underline">@{person.handle}</Link>} ·{" "}
            {track ? (isLive(person) ? "● live now" : `earlier today, ${ago(person.updatedAt)}`) : "no song yet today"}
          </p>
          {track && (
            <>
              <p className="truncate font-semibold">{track.title}</p>
              <p className="truncate text-sm opacity-70">{track.artist}</p>
            </>
          )}
          {person.cell && <p className="mt-1 text-xs opacity-50">Somewhere in the shaded zone, about 1 km wide</p>}
        </div>
        <button onClick={onClose} aria-label="Close" className="px-1 text-lg opacity-60">×</button>
      </div>

      {track && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <PreviewButton trackId={track.id} />
          <OpenInSpotify trackId={track.id} />
          <a href={`https://music.apple.com/us/search?term=${q}`} target="_blank" rel="noreferrer" className="underline">Apple Music</a>
        </div>
      )}
    </section>
  );
}
