"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Connecting Spotify, in two plain steps:
//   1. Connect Last.fm (one button; you sign in on last.fm and come back).
//   2. Inside Last.fm, turn on Spotify (one link straight to that page).
// After step 1 we quietly start reading plays; there is nothing to test or confirm. Plays
// appear on Home by themselves, usually within a few minutes of the next song.
export default function ConnectSteps({
  connectedAs,
  oneTap,
  justConnected,
  failed,
}: {
  connectedAs: string | null;
  /** True when the server has what it needs for the one-button Last.fm sign-in. */
  oneTap: boolean;
  justConnected: boolean;
  failed: boolean;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(failed ? "Last.fm did not finish connecting. Try again." : null);

  // Straight after connecting, start the first import in the background.
  const startReading = () => fetch("/api/lastfm/sync", { method: "POST" }).then(() => router.refresh()).catch(() => {});
  useEffect(() => {
    if (justConnected && connectedAs) startReading();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connectByName(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/lastfm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim().replace(/^@/, "") }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not connect. Try again.");
      return;
    }
    router.refresh();
    startReading();
  }

  const byName = (
    <form onSubmit={connectByName} className="flex flex-col gap-2">
      <label htmlFor="connect-lastfm" className="text-xs opacity-70">
        Your Last.fm username
      </label>
      <div className="flex gap-2">
        <input
          id="connect-lastfm"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Last.fm username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="field min-w-0 flex-1"
        />
        <button type="submit" disabled={busy || !username.trim()} className="btn px-4">
          {busy ? "Checking..." : "Connect"}
        </button>
      </div>
    </form>
  );

  return (
    <ol className="flex flex-col gap-4">
      <Step n={1} title="Connect Last.fm" done={Boolean(connectedAs)}>
        {connectedAs ? (
          <p>
            Connected as <span className="font-semibold">{connectedAs}</span>.
          </p>
        ) : (
          <>
            <p>Last.fm is the free service that keeps track of what you play. TunedIn reads it from there.</p>
            {oneTap ? (
              <>
                {/* A normal link, not client navigation: it leaves the app for last.fm. */}
                <a href="/api/lastfm/connect" className="btn block">
                  Connect Last.fm
                </a>
                <p className="text-xs opacity-60">
                  No account yet? You can create one on the page that opens. We only learn your username,
                  never your password.
                </p>
                <details className="text-xs">
                  <summary className="cursor-pointer opacity-70">Type my username instead</summary>
                  <div className="mt-2">{byName}</div>
                </details>
              </>
            ) : (
              <>
                <ExternalLink href="https://www.last.fm/join">No account yet? Create one free</ExternalLink>
                {byName}
              </>
            )}
            {error && <p role="alert" className="text-danger">{error}</p>}
          </>
        )}
      </Step>

      <Step n={2} title="Turn on Spotify inside Last.fm" dimmed={!connectedAs}>
        <p>
          Open the page below, find <span className="font-semibold">Spotify Scrobbling</span> and press{" "}
          <span className="font-semibold">Connect</span>. Sign in to Spotify when it asks.
        </p>
        <a
          href="https://www.last.fm/settings/applications"
          target="_blank"
          rel="noreferrer noopener"
          className={`btn block ${connectedAs ? "" : "pointer-events-none"}`}
          aria-disabled={!connectedAs}
        >
          Open Last.fm&apos;s Spotify page ↗
        </a>
        <p className="text-xs opacity-60">
          That is everything. From your next song on, what you play on Spotify shows up in TunedIn by
          itself, usually within a few minutes.
        </p>
        <p className="text-xs opacity-60">
          Nothing after ten minutes? In Last.fm&apos;s privacy settings, make sure &quot;Hide recent listening
          information&quot; is off. Settings in TunedIn shows whether your plays are coming through.
        </p>
        <p className="text-xs opacity-60">
          On Apple Music or another service? Last.fm lists apps that connect them under &quot;Track My
          Music&quot;.
        </p>
      </Step>
    </ol>
  );
}

function Step({ n, title, done, dimmed, children }: { n: number; title: string; done?: boolean; dimmed?: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex gap-3 rounded-xl border border-foreground/15 p-4 ${dimmed ? "opacity-50" : ""}`}>
      <span
        aria-hidden
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          done ? "bg-live text-background" : "bg-accent text-accent-foreground"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
        <h2 className="font-semibold">
          {title}
          {done && <span className="sr-only"> (done)</span>}
        </h2>
        {children}
      </div>
    </li>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="self-start underline">
      {children} ↗
    </a>
  );
}
