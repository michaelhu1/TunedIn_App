"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Result =
  | { kind: "found"; imported: number; nowPlaying: boolean }
  | { kind: "empty" }
  | { kind: "private" };

// The three steps, in order. The first two happen on last.fm in a new tab; the third is the
// only thing typed here. After connecting we run the reader once straight away, so the
// person sees proof that it worked ("we found 23 plays") instead of an empty screen.
export default function ConnectSteps({ connectedAs }: { connectedAs: string | null }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [connected, setConnected] = useState<string | null>(connectedAs);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const name = username.trim().replace(/^@/, "");
    const res = await fetch("/api/lastfm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: name }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setBusy(false);
      setError(body.error ?? "Could not connect. Try again.");
      return;
    }
    setConnected(name);

    // First read, right now.
    const sync = await fetch("/api/lastfm/sync", { method: "POST" }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    const me = sync?.me;
    if (me?.status === "private") setResult({ kind: "private" });
    else if (me && (me.imported > 0 || me.nowPlaying)) setResult({ kind: "found", imported: me.imported, nowPlaying: me.nowPlaying });
    else setResult({ kind: "empty" });
    router.refresh();
  }

  if (connected) {
    return (
      <section className="rounded-xl border border-foreground/15 p-4">
        <p className="font-semibold">Connected as {connected} on Last.fm</p>
        <p role="status" className="mt-2 text-sm opacity-80">
          {result?.kind === "found" &&
            `It works. We found ${result.imported} recent play${result.imported === 1 ? "" : "s"}${
              result.nowPlaying ? " and what you are playing right now" : ""
            }. More of your week will fill in over the next few minutes.`}
          {result?.kind === "empty" &&
            "Connected, but Last.fm has no plays for you yet. That is normal for a new account: play a song on Spotify, give it a minute, and it will show up here. If it never does, check that Spotify is connected in step 2."}
          {result?.kind === "private" &&
            "Connected, but your Last.fm profile hides its recent tracks, so we cannot read them. On Last.fm, open Settings, Privacy, and turn off \"Hide recent listening information\"."}
          {!result && "Your plays are being read automatically. You can change this any time under Me."}
        </p>
      </section>
    );
  }

  return (
    <ol className="flex flex-col gap-4">
      <Step n={1} title="Create a free Last.fm account">
        <p>Skip this if you already have one.</p>
        <ExternalLink href="https://www.last.fm/join">Open Last.fm sign-up</ExternalLink>
      </Step>

      <Step n={2} title="Connect Spotify to Last.fm">
        <p>
          On Last.fm, go to Settings, then Applications, and press Connect next to Spotify Scrobbling. From
          then on Last.fm logs every song you play on Spotify, on any device.
        </p>
        <ExternalLink href="https://www.last.fm/settings/applications">Open Last.fm applications</ExternalLink>
        <p className="text-xs opacity-60">
          On Apple Music or another service? Last.fm lists apps that connect them under &quot;Track My Music&quot;.
          Or skip this and set your songs by hand.
        </p>
      </Step>

      <Step n={3} title="Tell us your Last.fm username">
        <form onSubmit={connect} className="flex flex-col gap-2">
          <label htmlFor="connect-lastfm" className="sr-only">
            Last.fm username
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
          <p className="text-xs opacity-60">
            Just the username, never your password. We only read your public Last.fm profile, and whatever
            it logs is already public there.
          </p>
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        </form>
      </Step>
    </ol>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-xl border border-foreground/15 p-4">
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background"
      >
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
        <h2 className="font-semibold">{title}</h2>
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
