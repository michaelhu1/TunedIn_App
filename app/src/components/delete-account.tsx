"use client";

import { useState } from "react";

// Deleting an account cannot be undone, so it asks the person to type their handle first.
export default function DeleteAccount({ handle }: { handle: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account", { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setBusy(false);
      setError(body.error ?? "Could not delete your account. Try again.");
      return;
    }
    // A full page load, so nothing from the old session lingers.
    window.location.href = "/";
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start text-sm underline opacity-60">
        Delete my account
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-red-500/40 p-4 text-sm">
      <p className="font-semibold">Delete your account for good?</p>
      <p className="opacity-70">
        This removes your profile, photo, listening history, friends and location straight away. It cannot be
        undone. You can sign up again later, but you would start from nothing.
      </p>
      <label htmlFor="confirm-delete" className="opacity-80">
        Type your handle, <span className="font-semibold">{handle}</span>, to confirm
      </label>
      <input
        id="confirm-delete"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        className="field"
      />
      <div className="flex gap-3">
        <button
          type="button"
          disabled={busy || typed.trim().toLowerCase().replace(/^@/, "") !== handle}
          onClick={remove}
          className="btn bg-red-600 px-4 text-white"
        >
          {busy ? "Deleting..." : "Delete account"}
        </button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className="underline opacity-70">
          Cancel
        </button>
      </div>
      {error && <p role="alert" className="text-red-500">{error}</p>}
    </div>
  );
}
