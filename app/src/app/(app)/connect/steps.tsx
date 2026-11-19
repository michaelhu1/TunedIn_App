"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Check = { kind: "found"; imported: number; nowPlaying: boolean } | { kind: "empty" } | { kind: "private" } | { kind: "error" };

// Step 1: connect Last.fm (one button; signs in on last.fm, no username to type).
// Step 2: link Spotify inside Last.fm (one link straight to the right page), then check.
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
  const [check, setCheck] = useState<Check | null>(null);

  async function runCheck() {
    setBusy(true);
    setCheck(null);
    const sync = await fetch("/api/lastfm/sync", { method: "POST" }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    const me = sync?.me;
    if (!sync) setCheck({ kind: "error" });
    else if (me?.status === "private") setCheck({ kind: "private" });
    else if (me && (me.imported > 0 || me.nowPlaying)) setCheck({ kind: "found", imported: me.imported, nowPlaying: me.nowPlaying });
    else setCheck({ kind: "empty" });
    router.refresh();
  }

  // Straight after coming back from Last.fm, look for plays without being asked.
  useEffect(() => {
    if (justConnected && connectedAs) runCheck();
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
    runCheck();
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
            {oneTap ? (
              <>
                {/* A normal link, not client navigation: it leaves the app for last.fm. */}
                <a href="/api/lastfm/connect" className="btn block">
                  Connect Last.fm
                </a>
                <p className="text-xs opacity-60">
                  You sign in on Last.fm and come straight back. We only learn your username, never your
                  password.
                </p>
                <ExternalLink href="https://www.last.fm/join">New to Last.fm? Create a free account first</ExternalLink>
                <details className="text-xs">
                  <summary className="cursor-pointer opacity-70">Type my username instead</summary>
                  <div className="mt-2">{byName}</div>
                </details>
              </>
            ) : (
              <>
                <ExternalLink href="https://www.last.fm/join">New to Last.fm? Create a free account first</ExternalLink>
                {byName}
              </>
            )}
            {error && <p role="alert" className="text-red-500">{error}</p>}
          </>
        )}
      </Step>

      <Step n={2} title="Link Spotify to Last.fm" done={check?.kind === "found"} dimmed={!connectedAs}>
        <p>
          On the page this opens, press Connect next to Spotify Scrobbling. From then on Last.fm logs every
          song you play on Spotify, on any device.
        </p>
        <ExternalLink href="https://www.last.fm/settings/applications">Open Last.fm&apos;s Spotify page</ExternalLink>
        <p className="text-xs opacity-60">
          On Apple Music or another service? Last.fm lists apps that connect them under &quot;Track My
          Music&quot;.
        </p>
        {connectedAs && (
          <>
            <button type="button" onClick={runCheck} disabled={busy} className="btn mt-1">
              {busy ? "Checking..." : "Check it is working"}
            </button>
            <p role="status" className="opacity-80">
              {check?.kind === "found" &&
                `It works. We found ${check.imported} recent play${check.imported === 1 ? "" : "s"}${
                  check.nowPlaying ? " and what you are playing right now" : ""
                }. More of your week fills in over the next few minutes.`}
              {check?.kind === "empty" &&
                "Nothing yet. That is normal straight after linking: play a song on Spotify, wait a minute, and check again."}
              {check?.kind === "private" &&
                'Your Last.fm profile hides its recent tracks, so we cannot read them. On Last.fm, open Settings, Privacy, and turn off "Hide recent listening information".'}
              {check?.kind === "error" && "Could not check right now. Try again in a moment."}
            </p>
          </>
        )}
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
          done ? "bg-green-600 text-white" : "bg-foreground text-background"
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
