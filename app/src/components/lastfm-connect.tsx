"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LastfmConnect({ username }: { username: string | null }) {
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
        <button className="mt-1 underline opacity-70" disabled={busy} onClick={() => save(null)}>
          Disconnect
        </button>
        {error && <p role="alert" className="mt-1 text-red-500">{error}</p>}
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
        Count every play automatically. Enter your Last.fm username
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
        No Last.fm yet? Create a free account at last.fm, then connect Spotify under its Settings, Applications. We only read your public Last.fm profile, and anything it logs is already public there.
      </p>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    </form>
  );
}
