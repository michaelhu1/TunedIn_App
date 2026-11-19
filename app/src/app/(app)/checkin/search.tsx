"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PreviewButton from "@/components/preview-button";

type Result = { artist: string; title: string; album: string | null; artworkUrl: string | null; deezerId: number | null };

export default function CheckinSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [status, setStatus] = useState<"idle" | "searching" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  // Search 300ms after the last keystroke, and drop answers to outdated queries.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("searching");
      setError(null);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        setResults(body.results);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error && err.message ? err.message : "Search failed. Try again.");
      }
      setStatus("idle");
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function checkIn(track: Result) {
    setStatus("saving");
    setError(null);
    const res = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artist: track.artist, title: track.title }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not check in. Try again.");
      setStatus("idle");
      return;
    }
    router.replace("/home");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        aria-label="Search for a song"
        placeholder="Song or artist"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="field"
      />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {status === "searching" && results.length === 0 && <p className="text-sm opacity-60">Searching...</p>}
      <ul className="flex flex-col">
        {results.map((t, i) => (
          <li key={`${t.artist}-${t.title}-${i}`} className="flex items-center gap-2">
            <button
              type="button"
              disabled={status === "saving"}
              onClick={() => checkIn(t)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-2 text-left hover:bg-foreground/5 disabled:opacity-50"
            >
              {t.artworkUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.artworkUrl} alt="" width={48} height={48} className="h-12 w-12 rounded" />
              ) : (
                <div className="h-12 w-12 rounded bg-foreground/10" />
              )}
              <span className="min-w-0">
                <span className="block truncate font-medium">{t.title}</span>
                <span className="block truncate text-sm opacity-70">{t.artist}</span>
              </span>
            </button>
            {t.deezerId && <PreviewButton deezerId={t.deezerId} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
