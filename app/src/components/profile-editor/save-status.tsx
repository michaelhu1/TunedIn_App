"use client";

import { useCallback, useState } from "react";

// Each editor section saves on its own and reports how it went right next to itself, so a
// failure in one section never throws away what was typed in another.

export type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

/** State for one section's save, plus helpers that keep the transitions in one place. */
export function useSaveState() {
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  return {
    state,
    busy: state.kind === "saving",
    saving: useCallback(() => setState({ kind: "saving" }), []),
    saved: useCallback(() => setState({ kind: "saved" }), []),
    failed: useCallback((message: string) => setState({ kind: "error", message }), []),
    // Called when the person edits again, so an old "Saved" does not describe new text.
    reset: useCallback(() => setState((s) => (s.kind === "saving" ? s : { kind: "idle" })), []),
  };
}

export default function SaveStatus({ state }: { state: SaveState }) {
  if (state.kind === "error") {
    return (
      <p role="alert" className="text-sm text-red-500">
        {state.message}
      </p>
    );
  }
  // aria-live so screen readers announce "Saved" without moving focus.
  return (
    <p aria-live="polite" className="min-h-5 text-sm opacity-60">
      {state.kind === "saving" ? "Saving..." : state.kind === "saved" ? "Saved" : ""}
    </p>
  );
}
