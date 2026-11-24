"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// "Connect Apple Music": one button. It opens Apple's own sign-in window (MusicKit JS, a
// script served by Apple), the person approves, and Apple hands back a token that lets
// TunedIn read which songs they played. The token goes straight to our server and is kept
// there; this page does not hold on to it.
//
// Apple's script is only loaded where `canAuthorize` is true (the Connect screen), and only
// for people who are not connected yet. It is fetched as soon as the screen opens, not on
// the tap, because browsers only allow a tap to open a window if nothing slow happens
// between the tap and the window.

const MUSICKIT_SRC = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";

type MusicKitInstance = { authorize(): Promise<string> };
type MusicKitGlobal = {
  configure(config: { developerToken: string; app: { name: string; build: string } }): Promise<unknown>;
  getInstance(): MusicKitInstance;
};
declare global {
  interface Window {
    MusicKit?: MusicKitGlobal;
  }
}

function loadMusicKit(): Promise<MusicKitGlobal> {
  if (window.MusicKit) return Promise.resolve(window.MusicKit);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), 15_000);
    document.addEventListener(
      "musickitloaded",
      () => {
        clearTimeout(timer);
        if (window.MusicKit) resolve(window.MusicKit);
        else reject(new Error("missing"));
      },
      { once: true },
    );
    if (!document.querySelector(`script[src="${MUSICKIT_SRC}"]`)) {
      const script = document.createElement("script");
      script.src = MUSICKIT_SRC;
      script.async = true;
      script.onerror = () => {
        clearTimeout(timer);
        reject(new Error("blocked"));
      };
      document.head.appendChild(script);
    }
  });
}

// What the reader last found for this person (see src/lib/apple-music-sync.ts).
const STATUS_TEXT: Record<string, string> = {
  ok: "Reading your plays automatically.",
  expired: "Apple Music stopped sharing your plays with TunedIn. This happens every few months, or if your subscription lapsed. Connect again to carry on.",
  error: "Apple Music did not answer last time. We will keep trying.",
};

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  return mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)}h ago`;
}

export default function AppleMusicConnect({
  connected,
  status = null,
  syncedAt = null,
  replacesLastfm = false,
  canAuthorize = false,
}: {
  connected: boolean;
  status?: string | null;
  syncedAt?: string | null;
  /** True when the person has Last.fm connected, which connecting Apple Music will replace. */
  replacesLastfm?: boolean;
  /** True on the Connect screen, where the button itself is shown. Elsewhere it is a link there. */
  canAuthorize?: boolean;
}) {
  const router = useRouter();
  const kit = useRef<MusicKitInstance | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsConnect = !connected || status === "expired";
  const prepare = canAuthorize && needsConnect;

  useEffect(() => {
    if (!prepare) return;
    let cancelled = false;
    (async () => {
      try {
        const [MusicKit, tokenRes] = await Promise.all([loadMusicKit(), fetch("/api/apple-music/token")]);
        if (!tokenRes.ok) throw new Error("token");
        const { developerToken } = (await tokenRes.json()) as { developerToken: string };
        await MusicKit.configure({ developerToken, app: { name: "TunedIn", build: "1.0.0" } });
        if (cancelled) return;
        kit.current = MusicKit.getInstance();
        setReady(true);
      } catch {
        if (!cancelled) setError("Could not reach Apple Music. Check your connection, or turn off any content blocker for this page, and reload.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prepare]);

  async function save(musicUserToken: string | null): Promise<boolean> {
    const res = await fetch("/api/apple-music", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ musicUserToken }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not save. Try again.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function connect() {
    if (!kit.current) return;
    setBusy(true);
    setError(null);
    let token: string | null = null;
    try {
      // Must be the first thing after the tap: this is what opens Apple's window.
      token = await kit.current.authorize();
    } catch {
      token = null;
    }
    if (!token) setError("Apple Music was not connected. Approve TunedIn in Apple's window to continue.");
    else await save(token);
    setBusy(false);
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    await save(null);
    setBusy(false);
  }

  const button = canAuthorize ? (
    <button type="button" className="btn block w-full" disabled={!ready || busy} onClick={connect}>
      {busy ? "Waiting for Apple..." : !ready && !error ? "Getting ready..." : connected ? "Connect Apple Music again" : "Connect Apple Music"}
    </button>
  ) : (
    <Link href="/connect" className="self-start underline">
      {connected ? "Connect Apple Music again" : "Connect Apple Music"}
    </Link>
  );

  return (
    <div className="flex flex-col gap-2 text-sm">
      {connected && (
        <>
          <p>
            <span className="font-semibold">Apple Music</span> connected
          </p>
          <p className={status && status !== "ok" ? "text-danger" : "opacity-60"}>
            {status ? STATUS_TEXT[status] ?? "" : "We will start reading your plays in a moment."}
            {status === "ok" && syncedAt ? ` Last checked ${ago(syncedAt)}.` : ""}
          </p>
        </>
      )}
      {needsConnect && button}
      {needsConnect && canAuthorize && !connected && (
        <p className="text-xs opacity-60">
          You sign in with Apple, in Apple&apos;s own window. TunedIn only reads which songs you play, never your
          password, and needs an Apple Music subscription to read from.
          {replacesLastfm ? " This replaces your Last.fm connection, so plays are not counted twice." : ""}
        </p>
      )}
      {connected && (
        <button type="button" className="self-start underline opacity-70" disabled={busy} onClick={disconnect}>
          Disconnect
        </button>
      )}
      {error && <p role="alert" className="text-danger">{error}</p>}
    </div>
  );
}
