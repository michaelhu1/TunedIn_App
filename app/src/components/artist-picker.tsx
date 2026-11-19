"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Artist = { name: string; pictureUrl: string | null };
const MAX = 5;

// Pick up to five favourite artists: tap from a grid of popular ones, or search for anyone.
// Used as the last step of sign-up and from the profile editor.
export default function ArtistPicker({
  popular,
  initial = [],
  doneHref,
  doneLabel = "Done",
  autoSave = false,
}: {
  popular: Artist[];
  initial?: string[];
  /** Where to go after saving. Left out in the editor, where the picker stays on the page. */
  doneHref?: string;
  doneLabel?: string;
  /** Save on every tap and hide the button. Used in the profile editor, where everything
   *  you tap saves right away. */
  autoSave?: boolean;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Artist[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/artists?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const body = await res.json();
        setResults(body.results ?? []);
      } catch {
        // Ignored: either the request was replaced by a newer one, or search is unavailable
        // and the grid of popular artists still works.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const has = (name: string) => chosen.some((c) => c.toLowerCase() === name.toLowerCase());
  const full = chosen.length >= MAX;

  function toggle(name: string) {
    setMessage(null);
    const next = has(name) ? chosen.filter((x) => x.toLowerCase() !== name.toLowerCase()) : chosen.length >= MAX ? chosen : [...chosen, name];
    if (next === chosen) return;
    setChosen(next);
    if (autoSave) void save(next, chosen);
  }

  async function save(names: string[] = chosen, before?: string[]) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/profile/artists", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      if (before) setChosen(before); // an instant save that failed: put the picks back
      setMessage({ kind: "error", text: body.error ?? "Could not save. Try again." });
      return;
    }
    if (doneHref) {
      router.replace(doneHref);
      router.refresh();
      return;
    }
    if (!autoSave) setChosen(body.names ?? names);
    setMessage({ kind: "ok", text: "Saved" });
    router.refresh();
  }

  // Search results when searching, otherwise the popular grid.
  const shown = query.trim().length >= 2 ? results : popular;

  return (
    <div className="flex flex-col gap-4">
      {chosen.length > 0 && (
        <ul aria-label="Your picks" className="flex flex-wrap gap-2">
          {chosen.map((name) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => toggle(name)}
                aria-label={`Remove ${name}`}
                className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground"
              >
                {name} ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        type="search"
        aria-label="Search for an artist"
        placeholder="Search for an artist"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="field"
      />

      <ul className="grid grid-cols-3 gap-3">
        {shown.map((a) => {
          const selected = has(a.name);
          return (
            <li key={a.name}>
              <button
                type="button"
                aria-pressed={selected}
                disabled={(!selected && full) || (autoSave && busy)}
                onClick={() => toggle(a.name)}
                className="flex w-full flex-col items-center gap-1.5 text-center disabled:opacity-40"
              >
                <span
                  className={`block aspect-square w-full overflow-hidden rounded-full bg-foreground/10 ring-offset-2 ring-offset-background ${
                    selected ? "ring-4 ring-foreground" : ""
                  }`}
                >
                  {a.pictureUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.pictureUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  )}
                </span>
                <span className="w-full truncate text-xs font-medium">{a.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {query.trim().length >= 2 && results.length === 0 && <p className="text-sm opacity-60">No artists found.</p>}

      <p aria-live="polite" className="text-sm opacity-70">
        {full ? `That is ${MAX}. Tap one to swap it out.` : `${chosen.length} of ${MAX} picked`}
      </p>

      {!autoSave && (
        <button type="button" onClick={() => save()} disabled={busy} className="btn">
          {busy ? "Saving..." : doneLabel}
        </button>
      )}
      {autoSave && busy && <p className="text-sm opacity-60">Saving...</p>}
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-danger" : "opacity-70"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
