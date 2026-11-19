"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// What the reader last found for this person (see src/lib/lastfm-sync.ts).
const STATUS_TEXT: Record<string, string> = {
  ok: "Reading your plays automatically.",
  private: "Your Last.fm profile hides its recent tracks, so we cannot read your plays. Turn that off in Last.fm, under Settings, Privacy.",
  not_found: "Last.fm no longer has a user with this name. Disconnect and enter the right one.",
  error: "Last.fm did not answer last time. We will keep trying.",
};

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  return mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)}h ago`;
}

export default function LastfmConnect({
  username,
  status = null,
  syncedAt = null,
}: {
  username: string | null;
  status?: string | null;
  syncedAt?: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(next: string | null) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/lastfm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: next }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not save. Try again.");
      return;
    }
    setValue("");
    router.refresh();
  }

  if (username) {
    return (
      <div className="text-sm">
        <p>
          Last.fm connected as <span className="font-semibold">{username}</span>
        </p>
        <p className={`mt-1 ${status && status !== "ok" ? "text-danger" : "opacity-60"}`}>
          {status ? STATUS_TEXT[status] ?? "" : "We will start reading your plays in a moment."}
          {status === "ok" && syncedAt ? ` Last checked ${ago(syncedAt)}.` : ""}
        </p>
        <button className="mt-1 underline opacity-70" disabled={busy} onClick={() => save(null)}>
          Disconnect
        </button>
        {error && <p role="alert" className="mt-1 text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save(value);
      }}
    >
      <label htmlFor="lastfm" className="text-sm opacity-80">
        Your Last.fm username
      </label>
      <div className="flex gap-2">
        <input
          id="lastfm"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Last.fm username"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="field min-w-0 flex-1"
        />
        <button type="submit" disabled={busy || !value.trim()} className="btn px-4">
          {busy ? "..." : "Connect"}
        </button>
      </div>
      <p className="text-xs opacity-60">
        We read your Spotify plays through Last.fm. We only read your public Last.fm profile.
      </p>
      <Link href="/connect" className="text-sm underline">
        New to Last.fm? Follow the two-minute setup
      </Link>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </form>
  );
}
