"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Avatar from "@/components/avatar";
import Cover from "@/components/cover";
import OpenInSpotify from "@/components/open-in-spotify";
import PreviewButton from "@/components/preview-button";
import { cellBounds, cellCenter, encodeCell } from "@/lib/geo/geohash";
import { createClient } from "@/lib/supabase/client";

export type MapPerson = {
  userId: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  isMe: boolean;
  cell: string | null; // null = sharing music but not location
  updatedAt: string;
  track: { id: string; title: string; artist: string; artworkUrl: string | null } | null;
};

const LIVE_MINUTES = 30;
const NYU: [number, number] = [-73.9965, 40.7295]; // Washington Square, [lon, lat]
// OpenFreeMap: free, open-source map tiles with no API key or usage billing. The map follows
// the phone's light or dark setting, like the rest of the app.
const MAP_STYLES = {
  light: "https://tiles.openfreemap.org/styles/bright",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
const ZONE_COLOR = "#8b5cf6";
const ZONE_RADIUS_M = 700; // a circle this size covers a whole location cell (about 1.2 x 0.6 km)
const AVATAR_COLORS = ["#6d28d9", "#db2777", "#0891b2", "#16a34a", "#ea580c", "#4f46e5", "#be123c", "#0d9488"];

/** A circle on the ground as a polygon, for drawing a friend's zone. */
function zoneCircle(lon: number, lat: number, radiusM: number): [number, number][] {
  const points: [number, number][] = [];
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 48; i++) {
    const a = (2 * Math.PI * i) / 48;
    points.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return points;
}

/** Same colour-from-handle rule as the Avatar component, so a person looks the same everywhere. */
function colorFor(handle: string): string {
  let hash = 0;
  for (const ch of handle) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

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
        style: window.matchMedia("(prefers-color-scheme: dark)").matches ? MAP_STYLES.dark : MAP_STYLES.light,
        center: NYU,
        zoom: 13,
        attributionControl: false,
      });
      // Map credits go top-left, out of the way of the card that floats over the bottom.
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "top-left");
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      // "style.load" fires as soon as the map style is in, before every tile has drawn,
      // so friends appear without waiting on a slow connection.
      map.once("style.load", () => {
        // One soft circle per occupied zone. A zone is all we know about where someone is,
        // so the map shows an area, not a point pretending to be exact.
        map.addSource("cells", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "cells-fill", type: "fill", source: "cells", paint: { "fill-color": ZONE_COLOR, "fill-opacity": 0.16 } });
        map.addLayer({ id: "cells-line", type: "line", source: "cells", paint: { "line-color": ZONE_COLOR, "line-opacity": 0.55, "line-width": 1.5 } });
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
        const c = cellCenter(cell);
        return {
          type: "Feature" as const,
          properties: {},
          geometry: { type: "Polygon" as const, coordinates: [zoneCircle(c.lon, c.lat, ZONE_RADIUS_M)] },
        };
      });
      (map.getSource("cells") as GeoJSONSource).setData({ type: "FeatureCollection", features });

      for (const [cell, group] of byCell) {
        const center = cellCenter(cell);
        group.forEach((p, i) => {
          // Several friends in one zone are fanned out in a small ring so every pin is tappable.
          const angle = (2 * Math.PI * i) / group.length;
          const r = group.length > 1 ? 34 : 0; // pixels, so the ring looks the same at any zoom
          // A pin is the person's face (or initial), with the album they are playing as a
          // small badge, and their name underneath. Built by hand because MapLibre places
          // plain DOM elements, outside React.
          const el = document.createElement("button");
          el.type = "button";
          el.setAttribute("aria-label", `${p.isMe ? "You" : "@" + p.handle}${p.track ? `: ${p.track.title}` : ""}`);
          el.className = "tunedin-pin-button";
          // MapLibre positions `el` itself with position:absolute and a transform, so all of
          // our own layout goes on an inner element. (Styling `el` directly breaks placement.)
          const pin = document.createElement("span");
          pin.className = `tunedin-pin${isLive(p) && p.track ? " live" : ""}`;
          el.appendChild(pin);

          const face = document.createElement("span");
          face.className = "face";
          if (p.avatarUrl) face.style.backgroundImage = `url("${p.avatarUrl}")`;
          else {
            face.style.backgroundColor = colorFor(p.handle);
            face.textContent = p.handle.slice(0, 1).toUpperCase();
          }
          pin.appendChild(face);

          if (p.track?.artworkUrl) {
            const art = document.createElement("span");
            art.className = "art";
            art.style.backgroundImage = `url("${p.track.artworkUrl}")`;
            pin.appendChild(art);
          }

          const name = document.createElement("span");
          name.className = "name";
          name.textContent = p.isMe ? "You" : (p.displayName ?? p.handle);
          pin.appendChild(name);

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
        map.fitBounds(bounds, { padding: { top: 70, bottom: 150, left: 60, right: 60 }, maxZoom: 14, duration: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, placed]);

  // Tapping someone in the strip under the map selects them and glides the map to their zone.
  function focus(p: MapPerson) {
    setSelectedId(p.userId);
    if (p.cell && mapRef.current) {
      const c = cellCenter(p.cell);
      mapRef.current.easeTo({ center: [c.lon, c.lat], zoom: Math.max(mapRef.current.getZoom(), 13.5), offset: [0, -50] });
    }
  }

  const strip = [...placed, ...unplaced].filter((p) => !p.isMe);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative -mx-5 overflow-hidden sm:mx-0 sm:rounded-2xl">
        <div ref={container} className="h-[64vh] w-full bg-foreground/5" aria-label="Map of friends" />
        {/* The selected person's card floats over the bottom of the map. */}
        {selected && (
          <div className="absolute inset-x-3 bottom-3">
            <PersonCard person={selected} onClose={() => setSelectedId(null)} />
          </div>
        )}
      </div>

      {strip.length > 0 && (
        <ul aria-label="Friends" className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
          {strip.map((p) => (
            <li key={p.userId} className="shrink-0">
              <button
                type="button"
                onClick={() => focus(p)}
                className={`flex w-16 flex-col items-center gap-1 text-center ${selectedId === p.userId ? "" : "opacity-80"}`}
              >
                <span className={`rounded-full p-0.5 ${isLive(p) && p.track ? "bg-green-500" : "bg-foreground/15"}`}>
                  <Avatar handle={p.handle} src={p.avatarUrl} size={48} className="border-2 border-background" />
                </span>
                <span className="w-full truncate text-xs">{p.displayName ?? p.handle}</span>
                {!p.cell && <span className="-mt-1 text-[10px] opacity-60">no location</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

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

      {/* Pin styles live here because MapLibre creates the pins outside React. */}
      <style>{`
        .tunedin-pin-button { cursor: pointer; background: none; border: 0; padding: 0; }
        .tunedin-pin { position: relative; display: block; width: 52px; height: 52px; }
        .tunedin-pin .face {
          display: flex; align-items: center; justify-content: center;
          width: 52px; height: 52px; border-radius: 9999px; border: 3px solid #fff;
          background: #6d28d9 center / cover no-repeat; color: #fff; font-size: 20px; font-weight: 700;
          box-shadow: 0 3px 10px rgba(0,0,0,.4);
        }
        .tunedin-pin .art {
          position: absolute; right: -4px; bottom: -2px; width: 24px; height: 24px; border-radius: 6px;
          border: 2px solid #fff; background: #222 center / cover no-repeat; box-shadow: 0 1px 4px rgba(0,0,0,.4);
        }
        .tunedin-pin .name {
          position: absolute; left: 50%; top: 56px; transform: translateX(-50%); max-width: 96px;
          padding: 1px 7px; border-radius: 9999px; background: rgba(0,0,0,.72); color: #fff;
          font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .tunedin-pin.live .face { border-color: #22c55e; animation: tunedin-pulse 2s ease-out infinite; }
        @keyframes tunedin-pulse {
          0% { box-shadow: 0 3px 10px rgba(0,0,0,.4), 0 0 0 0 rgba(34,197,94,.55); }
          100% { box-shadow: 0 3px 10px rgba(0,0,0,.4), 0 0 0 14px rgba(34,197,94,0); }
        }
        @media (prefers-reduced-motion: reduce) { .tunedin-pin.live .face { animation: none; } }
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
    <section className="rounded-2xl border border-foreground/15 bg-background/95 p-3 shadow-lg backdrop-blur">
      <div className="flex items-start gap-3">
        <Cover src={track?.artworkUrl ?? null} size={56} />
        <div className="min-w-0 flex-1">
          <p className="text-xs opacity-60">
            {person.isMe ? "You" : <Link href={"/u/" + person.handle} className="font-semibold underline">{person.displayName ?? `@${person.handle}`}</Link>} ·{" "}
            {track ? (isLive(person) ? "● live now" : `earlier today, ${ago(person.updatedAt)}`) : "no song yet today"}
          </p>
          {track && (
            <>
              <p className="truncate font-semibold">{track.title}</p>
              <p className="truncate text-sm opacity-70">{track.artist}</p>
            </>
          )}
          {person.cell && <p className="text-xs opacity-50">Somewhere in the shaded circle</p>}
        </div>
        <button onClick={onClose} aria-label="Close" className="px-1 text-lg opacity-60">×</button>
      </div>

      {track && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <PreviewButton trackId={track.id} />
          <OpenInSpotify trackId={track.id} />
          <a href={`https://music.apple.com/us/search?term=${q}`} target="_blank" rel="noreferrer" className="underline">Apple Music</a>
        </div>
      )}
    </section>
  );
}
