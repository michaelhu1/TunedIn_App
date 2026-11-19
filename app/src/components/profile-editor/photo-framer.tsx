"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_ZOOM, clampFraming, initialFraming, zoomAroundCentre, type Framing } from "@/lib/image";

const VIEW = 280; // side of the square window, in CSS pixels

// The "move and zoom" step for a profile photo, like the one in Instagram.
//
// The photo sits behind a square window with a circle drawn on it (profile photos are shown
// as circles). Drag to move it, pinch or use the slider to zoom. Arrow keys and +/- work too,
// so it is usable without a touch screen or mouse.
//
// This component only tracks WHERE the photo is. The maths lives in src/lib/image.ts, and
// the parent turns the final position into the saved 256px image.
export default function PhotoFramer({
  source,
  width,
  height,
  busy,
  onCancel,
  onConfirm,
}: {
  /** A small preview of the photo to show while positioning. */
  source: string;
  width: number;
  height: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (framing: Framing, view: number) => void;
}) {
  const [framing, setFraming] = useState<Framing>(() => initialFraming(width, height, VIEW));
  // Fingers (or the mouse) currently down, by pointer id. Two of them means a pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);

  const scale = (VIEW / Math.min(width, height)) * framing.zoom;

  const move = (dx: number, dy: number) =>
    setFraming((f) => clampFraming({ ...f, x: f.x + dx, y: f.y + dy }, width, height, VIEW));
  const zoomTo = (zoom: number) => setFraming((f) => zoomAroundCentre(f, zoom, width, height, VIEW));

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: framing.zoom };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const previous = pointers.current.get(e.pointerId);
    if (!previous) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current.distance > 0) zoomTo(pinch.current.zoom * (distance / pinch.current.distance));
    } else if (pointers.current.size === 1) {
      move(e.clientX - previous.x, e.clientY - previous.y);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 30 : 10;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => move(step, 0),
      ArrowRight: () => move(-step, 0),
      ArrowUp: () => move(0, step),
      ArrowDown: () => move(0, -step),
      "+": () => zoomTo(framing.zoom + 0.2),
      "=": () => zoomTo(framing.zoom + 0.2),
      "-": () => zoomTo(framing.zoom - 0.2),
    };
    const action = keys[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  }

  // Mouse wheel / trackpad zoom. Attached by hand because React's onWheel cannot call
  // preventDefault, and without that the page would scroll at the same time.
  useEffect(() => {
    const el = windowRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setFraming((f) => zoomAroundCentre(f, f.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), width, height, VIEW));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [width, height]);

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-foreground/15 p-4">
      <p className="text-sm font-semibold">Move and zoom</p>

      <div
        ref={windowRef}
        role="application"
        aria-label="Photo position. Drag to move, pinch to zoom, or use the arrow keys and plus and minus."
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        // touch-action: none stops the page from scrolling or zooming while dragging the photo.
        className="relative cursor-grab touch-none overflow-hidden rounded-lg bg-foreground/10 active:cursor-grabbing"
        style={{ width: VIEW, height: VIEW, maxWidth: "100%" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={source}
          alt=""
          draggable={false}
          className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
          style={{
            width: width * scale,
            height: height * scale,
            transform: `translate(${framing.x}px, ${framing.y}px)`,
          }}
        />
        {/* Everything outside the circle is dimmed, so what you see in it is what people get. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)", border: "2px solid rgba(255,255,255,0.9)" }}
        />
      </div>

      <label className="flex w-full max-w-[280px] items-center gap-3 text-sm">
        <span className="opacity-70">Zoom</span>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={framing.zoom}
          onChange={(e) => zoomTo(Number(e.target.value))}
          className="flex-1 accent-current"
        />
      </label>

      <div className="flex gap-3">
        <button type="button" disabled={busy} onClick={() => onConfirm(framing, VIEW)} className="btn px-5">
          {busy ? "Saving..." : "Use this photo"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-lg border border-foreground/20 px-5 py-3 font-semibold disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
