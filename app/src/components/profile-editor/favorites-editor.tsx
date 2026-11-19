"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
// Type-only import: erased at build time, so the server-only module is not bundled here.
import type { ProfileFavorite } from "@/lib/profile";
import { createClient } from "@/lib/supabase/client";
import Cover from "@/components/cover";
import SaveStatus, { useSaveState } from "./save-status";

type Result = { artist: string; title: string; album: string | null; artworkUrl: string | null; deezerId: number | null };

// "On repeat right now": up to `max` songs.
//
// Adding goes through POST /api/profile/favorites, which checks the song against the music
// catalogue and picks the slot. Removing is a direct delete: row-level security only lets
// you delete your own rows, so there is nothing for a server route to add.
export default function FavoritesEditor({
  userId,
  initial,
  max,
}: {
  userId: string;
  initial: ProfileFavorite[];
  max: number;
}) {
  const router = useRouter();
  const [favorites, setFavorites] = useState(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const save = useSaveState();

  // Same pattern as the check-in search: wait 300ms after the last keystroke, and cancel
  // the request for an older query so a slow answer cannot overwrite a newer one.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearchError(null);
      // A cancelled request never reaches its own setSearching(false) below.
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        setResults(body.results);
      } catch (err) {
        if (controller.signal.aborted) return;
        setSearchError(err instanceof Error && err.message ? err.message : "Search failed. Try again.");
      }
      setSearching(false);
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function add(track: Result) {
    save.saving();
    const res = await fetch("/api/profile/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artist: track.artist, title: track.title }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return save.failed(body.error ?? "Could not add that song. Try again.");
    const added = body as ProfileFavorite;
    setFavorites((list) => [...list, added].sort((a, b) => a.position - b.position));
    setQuery("");
    setResults([]);
    save.saved();
    router.refresh();
  }

  async function remove(fav: ProfileFavorite) {
    save.saving();
    const { error } = await createClient()
      .from("profile_favorites")
      .delete()
      .eq("user_id", userId)
      .eq("position", fav.position);
    if (error) {
      console.error(error);
      return save.failed("Could not remove that song. Try again.");
    }
    setFavorites((list) => list.filter((f) => f.position !== fav.position));
    save.saved();
    router.refresh();
  }

  const full = favorites.length >= max;

  return (
    <div className="flex flex-col gap-3">
      {favorites.length === 0 ? (
        <p className="text-sm opacity-60">No songs yet. Pick up to {max} you cannot stop playing.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {favorites.map((f) => (
            <li key={f.position} className="flex items-center gap-3">
              <Cover src={f.artworkUrl} size={48} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{f.title}</span>
                <span className="block truncate text-sm opacity-70">{f.artist}</span>
              </span>
              <button
                type="button"
                disabled={save.busy}
                onClick={() => remove(f)}
                aria-label={`Remove ${f.title} by ${f.artist}`}
                className="rounded-lg border border-foreground/20 px-3 py-1 text-sm hover:bg-foreground/5 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {full ? (
        <p className="text-sm opacity-60">That is {max}. Remove one to add another.</p>
      ) : (
        <>
          <label htmlFor="favorite-search" className="text-sm opacity-80">
            Add a song ({favorites.length}/{max})
          </label>
          <input
            id="favorite-search"
            type="search"
            placeholder="Song or artist"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              save.reset();
            }}
            className="field"
          />
          {searchError && (
            <p role="alert" className="text-sm text-red-500">
              {searchError}
            </p>
          )}
          {searching && results.length === 0 && <p className="text-sm opacity-60">Searching...</p>}
          {results.length > 0 && (
            <ul className="flex flex-col" aria-label="Search results">
              {results.map((t, i) => (
                <li key={`${t.artist}-${t.title}-${i}`}>
                  <button
                    type="button"
                    disabled={save.busy}
                    onClick={() => add(t)}
                    className="flex w-full min-w-0 items-center gap-3 rounded-lg px-1 py-2 text-left hover:bg-foreground/5 disabled:opacity-50"
                  >
                    <Cover src={t.artworkUrl} size={48} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{t.title}</span>
                      <span className="block truncate text-sm opacity-70">{t.artist}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <SaveStatus state={save.state} />
    </div>
  );
}
