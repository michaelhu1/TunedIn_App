"use client";

import { useEffect, useState } from "react";

// A small play/stop button for a 30-second clip.
//
// There is ONE audio player for the whole page, shared by every button, so starting a clip
// stops whichever one was playing. Clip links come from /api/preview at the moment you
// press play, because Deezer's links expire after about 15 minutes.

const PREVIEW_VOLUME = 0.35;

let player: HTMLAudioElement | null = null;
let playingKey: string | null = null;
const listeners = new Set<(key: string | null) => void>();

function setPlaying(key: string | null) {
  playingKey = key;
  listeners.forEach((fn) => fn(key));
}

function stop() {
  player?.pause();
  setPlaying(null);
}

export default function PreviewButton({
  trackId,
  deezerId,
  className = "",
}: {
  trackId?: string; // a song in our database
  deezerId?: number; // or a song straight from Deezer search / chart
  className?: string;
}) {
  const key = trackId ? `t:${trackId}` : deezerId ? `d:${deezerId}` : null;
  const [state, setState] = useState<"idle" | "loading" | "playing" | "none">("idle");

  // Follow the shared player: if another button starts, this one goes back to idle.
  useEffect(() => {
    const onChange = (k: string | null) => setState((s) => (k === key ? "playing" : s === "none" ? "none" : "idle"));
    listeners.add(onChange);
    if (playingKey === key && key) setState("playing");
    return () => {
      listeners.delete(onChange);
    };
  }, [key]);

  if (!key) return null;

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation(); // the button often sits on top of something else that is tappable
    if (state === "playing") return stop();
    if (state === "loading" || state === "none") return;

    stop();
    setState("loading");
    const query = trackId ? `trackId=${trackId}` : `deezerId=${deezerId}`;
    const body = await fetch(`/api/preview?${query}`).then((r) => r.json()).catch(() => ({}));
    if (!body.url) return setState("none");

    player ??= new Audio();
    // Previews start quieter than full volume: they often play over whatever else is on, and a
    // sudden loud clip is unpleasant. (iPhones ignore this and use the phone's own volume.)
    player.volume = PREVIEW_VOLUME;
    player.src = body.url;
    player.onended = () => setPlaying(null);
    try {
      await player.play();
      setPlaying(key);
    } catch {
      setState("idle"); // the browser blocked playback; a second tap will work
    }
  }

  const label = { idle: "Play 30-second preview", loading: "Loading preview", playing: "Stop preview", none: "No preview available" }[state];

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      disabled={state === "none"}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm text-accent-foreground disabled:opacity-30 ${className}`}
    >
      {state === "playing" ? "■" : state === "loading" ? "…" : state === "none" ? "–" : "▶"}
    </button>
  );
}
