"use client";

import { isDarkNow } from "@/lib/themes";
import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Area } from "@/lib/nearby";
import Cover from "@/components/cover";
import OpenInSpotify from "@/components/open-in-spotify";
import PreviewButton from "@/components/preview-button";
import { cellBounds, cellCenter } from "@/lib/geo/geohash";

const NYU: [number, number] = [-73.9965, 40.7295];
const MAP_STYLES = {
  light: "https://tiles.openfreemap.org/styles/bright",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
const AREA_COLOR = "#db2777";
const AREA_RADIUS_M = 700;

function circle(lon: number, lat: number, radiusM: number): [number, number][] {
  const points: [number, number][] = [];
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 48; i++) {
    const a = (2 * Math.PI * i) / 48;
    points.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return points;
}

// The public map: areas, not people. Each busy area is a circle with a bubble saying how
// many people are listening there; tapping it lists the songs playing. Which areas exist,
// and the rule that an area needs several people before it shows, come from the database
// (`nearby_areas`). Nothing on this screen identifies anyone.
export default function PublicMapView({ areas, minPeople }: { areas: Area[]; minPeople: number }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  // Open on the area you are in, if it is busy enough to show.
  const [selectedCell, setSelectedCell] = useState<string | null>(areas.find((a) => a.myArea)?.cell ?? null);
  const selected = areas.find((a) => a.cell === selectedCell) ?? null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
      const map = new maplibregl.Map({
        container: container.current,
        style: isDarkNow() ? MAP_STYLES.dark : MAP_STYLES.light,
        center: NYU,
        zoom: 13,
        attributionControl: false,
      });
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "top-left");
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.once("style.load", () => {
        map.addSource("areas", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        // Busier areas are drawn more solidly.
        map.addLayer({
          id: "areas-fill", type: "fill", source: "areas",
          paint: { "fill-color": AREA_COLOR, "fill-opacity": ["interpolate", ["linear"], ["get", "people"], 5, 0.18, 40, 0.4] },
        });
        map.addLayer({ id: "areas-line", type: "line", source: "areas", paint: { "line-color": AREA_COLOR, "line-opacity": 0.6, "line-width": 1.5 } });
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

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    let cancelled = false;
    (async () => {
      const maplibregl = await import("maplibre-gl");
      if (cancelled) return;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      (map.getSource("areas") as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: areas.map((a) => {
          const c = cellCenter(a.cell);
          return {
            type: "Feature" as const,
            properties: { people: a.people },
            geometry: { type: "Polygon" as const, coordinates: [circle(c.lon, c.lat, AREA_RADIUS_M)] },
          };
        }),
      });

      for (const a of areas) {
        const c = cellCenter(a.cell);
        const el = document.createElement("button");
        el.type = "button";
        el.className = "tunedin-area-button";
        el.setAttribute("aria-label", `${a.name}: ${a.people} listening`);
        const bubble = document.createElement("span");
        bubble.className = `tunedin-area${a.myArea ? " mine" : ""}`;
        const count = document.createElement("strong");
        count.textContent = String(a.people);
        const label = document.createElement("span");
        label.textContent = a.name;
        bubble.append(count, label);
        el.appendChild(bubble);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          setSelectedCell(a.cell);
        });
        markersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([c.lon, c.lat]).addTo(map));
      }

      if (areas.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        for (const a of areas) {
          const b = cellBounds(a.cell);
          bounds.extend([b.west, b.south]).extend([b.east, b.north]);
        }
        map.fitBounds(bounds, { padding: { top: 70, bottom: 90, left: 60, right: 60 }, maxZoom: 14, duration: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, areas]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative -mx-5 overflow-hidden sm:mx-0 sm:rounded-2xl">
        <div ref={container} className="h-[52vh] w-full bg-foreground/5" aria-label="Map of busy areas" />
      </div>

      {areas.length === 0 ? (
        <div className="rounded-xl border border-foreground/15 p-4 text-sm">
          <p className="font-semibold">No busy areas right now.</p>
          <p className="mt-1 opacity-70">
            An area lights up when at least {minPeople} people there are sharing their location and listening to
            something. Nobody is ever shown individually here.
          </p>
        </div>
      ) : selected ? (
        <section className="rounded-xl border border-foreground/15 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-bold">{selected.name}</h2>
            <p className="whitespace-nowrap text-sm opacity-70">
              {selected.people} listening{selected.myArea ? " · you are here" : ""}
            </p>
          </div>
          <ol className="mt-2 flex flex-col">
            {selected.topTracks.map((t, i) => (
              <li key={t.track_id} className="flex items-center gap-3 py-2">
                <span className="w-4 text-right text-sm tabular-nums opacity-60">{i + 1}</span>
                <Cover src={t.artwork_url} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.title}</p>
                  <p className="truncate text-sm opacity-70">
                    {t.artist}
                    {t.listeners > 1 ? ` · ${t.listeners} people` : ""}
                  </p>
                </div>
                <PreviewButton trackId={t.track_id} />
                <OpenInSpotify trackId={t.track_id} compact />
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <ul className="flex flex-col">
          {areas.map((a) => (
            <li key={a.cell}>
              <button type="button" onClick={() => setSelectedCell(a.cell)} className="flex w-full items-center gap-3 py-2.5 text-left">
                <Cover src={a.topTracks[0]?.artwork_url ?? null} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{a.name}</span>
                  <span className="block truncate text-sm opacity-70">
                    {a.topTracks[0] ? `${a.topTracks[0].title} · ${a.topTracks[0].artist}` : ""}
                  </span>
                </span>
                <span className="whitespace-nowrap text-sm opacity-70">{a.people} listening</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && areas.length > 1 && (
        <button type="button" onClick={() => setSelectedCell(null)} className="self-start text-sm underline opacity-70">
          All areas
        </button>
      )}

      <p className="text-xs opacity-50">
        Areas are about 1 km wide and only appear with {minPeople} or more people. This map never shows who is
        listening, only how many and to what.
      </p>

      <style>{`
        .tunedin-area-button { cursor: pointer; background: none; border: 0; padding: 0; }
        .tunedin-area {
          display: flex; align-items: center; gap: 6px; padding: 5px 11px 5px 5px; border-radius: 9999px;
          background: #fff; color: #111; font-size: 12px; font-weight: 600; white-space: nowrap;
          box-shadow: 0 3px 10px rgba(0,0,0,.35); border: 2px solid ${AREA_COLOR};
        }
        .tunedin-area strong {
          display: flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; padding: 0 6px;
          border-radius: 9999px; background: ${AREA_COLOR}; color: #fff; font-size: 13px;
        }
        .tunedin-area.mine { border-color: #22c55e; }
      `}</style>
    </div>
  );
}
