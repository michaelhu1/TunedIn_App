"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
// Type-only import: erased at build time, so the server-only module is not bundled here.
import type { ProfileConcert } from "@/lib/profile";
import { createClient } from "@/lib/supabase/client";
import { CONCERT_STATUS, CONCERT_TEXT_MAX, MAX_CONCERTS, type ConcertStatusKey } from "@/lib/profile-options";
import {
  CONCERT_DATE_MAX,
  CONCERT_DATE_MIN,
  firstFreePosition,
  formatConcertDate,
  sortConcerts,
  validateConcert,
} from "@/lib/profile-validation";
import SaveStatus, { useSaveState } from "./save-status";

const STATUS_LIST = Object.entries(CONCERT_STATUS) as [ConcertStatusKey, string][];

// Shows you went to and shows you are going to, up to MAX_CONCERTS. Built like the
// playlists editor: rows are added and removed straight in the database (the owner may
// change their own rows), each in the first free position slot. The order people see is
// worked out from status and date (sortConcerts), not from the slot number.
export default function ConcertsEditor({ userId, initial }: { userId: string; initial: ProfileConcert[] }) {
  const router = useRouter();
  const [concerts, setConcerts] = useState(initial);
  const [status, setStatus] = useState<ConcertStatusKey>("going");
  const [artist, setArtist] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const save = useSaveState();

  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    save.reset();
  };

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const checked = validateConcert({ status, artist, venue, date });
    if (!checked.ok) return save.failed(checked.error);
    const position = firstFreePosition(
      concerts.map((c) => c.position),
      MAX_CONCERTS,
    );
    if (position === null) return save.failed(`You can add up to ${MAX_CONCERTS} concerts.`);

    save.saving();
    const { error } = await createClient()
      .from("profile_concerts")
      .insert({ user_id: userId, position, ...checked.value });
    if (error) {
      console.error(error);
      // 23514 = a check refused it. 23505 = that slot is taken, most likely by another tab.
      return save.failed(
        error.code === "23514"
          ? `That concert was not accepted. Artist and venue can be up to ${CONCERT_TEXT_MAX} characters.`
          : error.code === "23505"
            ? "Your concerts changed somewhere else. Refresh the page and try again."
            : "Could not save that concert. Try again.",
      );
    }
    const v = checked.value;
    setConcerts((list) => [...list, { position, status: v.status, artist: v.artist, venue: v.venue, eventDate: v.event_date }]);
    // Keep the status: people tend to add several past (or several upcoming) shows in a row.
    setArtist("");
    setVenue("");
    setDate("");
    save.saved();
    router.refresh();
  }

  async function remove(c: ProfileConcert) {
    save.saving();
    const { error } = await createClient()
      .from("profile_concerts")
      .delete()
      .eq("user_id", userId)
      .eq("position", c.position);
    if (error) {
      console.error(error);
      return save.failed("Could not remove that concert. Try again.");
    }
    setConcerts((list) => list.filter((x) => x.position !== c.position));
    save.saved();
    router.refresh();
  }

  const shown = sortConcerts(concerts);

  return (
    <div className="flex flex-col gap-3">
      {shown.length > 0 && (
        <ul className="flex flex-col gap-2">
          {shown.map((c) => (
            <li key={c.position} className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  <span className="opacity-60">{CONCERT_STATUS[c.status]} </span>
                  {c.artist}
                </span>
                {(c.venue || c.eventDate) && (
                  <span className="block truncate text-sm opacity-70">
                    {[c.venue, c.eventDate && formatConcertDate(c.eventDate)].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
              <button
                type="button"
                disabled={save.busy}
                onClick={() => remove(c)}
                aria-label={`Remove concert ${c.artist}`}
                className="rounded-lg border border-foreground/20 px-3 py-1 text-sm hover:bg-foreground/5 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {concerts.length >= MAX_CONCERTS ? (
        <p className="text-sm opacity-60">That is {MAX_CONCERTS}. Remove one to add another.</p>
      ) : (
        // noValidate: our own check gives clearer messages than the browser's.
        <form onSubmit={add} noValidate className="flex flex-col gap-2">
          <label htmlFor="concert-status" className="text-sm opacity-80">
            Going or went?
          </label>
          <select
            id="concert-status"
            value={status}
            onChange={(e) => edit(setStatus)(e.target.value as ConcertStatusKey)}
            className="field"
          >
            {STATUS_LIST.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>

          <label htmlFor="concert-artist" className="mt-1 text-sm opacity-80">
            Artist
          </label>
          <input
            id="concert-artist"
            value={artist}
            onChange={(e) => edit(setArtist)(e.target.value)}
            placeholder="Mitski"
            className="field"
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="concert-venue" className="mt-1 text-sm opacity-80">
                Venue <span className="opacity-60">(optional)</span>
              </label>
              <input
                id="concert-venue"
                value={venue}
                onChange={(e) => edit(setVenue)(e.target.value)}
                placeholder="Brooklyn Steel"
                className="field"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="concert-date" className="mt-1 text-sm opacity-80">
                Date <span className="opacity-60">(optional)</span>
              </label>
              <input
                id="concert-date"
                type="date"
                min={CONCERT_DATE_MIN}
                max={CONCERT_DATE_MAX}
                value={date}
                onChange={(e) => edit(setDate)(e.target.value)}
                // The page sets no color-scheme, so without this the browser's calendar
                // icon stays dark on the dark background.
                className="field scheme-light-dark"
              />
            </div>
          </div>

          <button type="submit" disabled={save.busy} className="btn mt-1">
            {save.busy ? "Saving..." : `Add concert (${concerts.length}/${MAX_CONCERTS})`}
          </button>
        </form>
      )}
      <SaveStatus state={save.state} />
    </div>
  );
}
