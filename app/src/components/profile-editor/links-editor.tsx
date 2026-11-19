"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
// Type-only import: erased at build time, so the server-only module is not bundled here.
import type { ProfileLink } from "@/lib/profile";
import { createClient } from "@/lib/supabase/client";
import { firstFreePosition, LINK_TITLE_MAX, serviceList, validateLink } from "@/lib/profile-validation";
import SaveStatus, { useSaveState } from "./save-status";

// Playlist links, up to `max`. Written straight to the database: the owner may add and
// remove their own rows, and a check constraint refuses anything that is not an https
// link to a known music service. We check the same rules first only to give a clearer
// message than the database can.
export default function LinksEditor({
  userId,
  initial,
  max,
  hosts,
}: {
  userId: string;
  initial: ProfileLink[];
  max: number;
  hosts: readonly string[];
}) {
  const router = useRouter();
  const [links, setLinks] = useState(initial);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const save = useSaveState();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const checked = validateLink(title, url, hosts);
    if (!checked.ok) return save.failed(checked.error);
    const position = firstFreePosition(
      links.map((l) => l.position),
      max,
    );
    if (position === null) return save.failed(`You can add up to ${max} playlists.`);

    save.saving();
    const row = { position, title: checked.value.title, url: checked.value.url };
    const { error } = await createClient()
      .from("profile_links")
      .insert({ user_id: userId, ...row });
    if (error) {
      console.error(error);
      // 23514 = the database's own check refused it (should be rare after our check).
      // 23505 = that slot is taken, most likely by an edit in another tab.
      return save.failed(
        error.code === "23514"
          ? `That link was not accepted. Links must be https and go to ${serviceList(hosts)}.`
          : error.code === "23505"
            ? "Your playlists changed somewhere else. Refresh the page and try again."
            : "Could not save that playlist. Try again.",
      );
    }
    setLinks((list) => [...list, row].sort((a, b) => a.position - b.position));
    setTitle("");
    setUrl("");
    save.saved();
    router.refresh();
  }

  async function remove(link: ProfileLink) {
    save.saving();
    const { error } = await createClient()
      .from("profile_links")
      .delete()
      .eq("user_id", userId)
      .eq("position", link.position);
    if (error) {
      console.error(error);
      return save.failed("Could not remove that playlist. Try again.");
    }
    setLinks((list) => list.filter((l) => l.position !== link.position));
    save.saved();
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {links.length > 0 && (
        <ul className="flex flex-col gap-2">
          {links.map((l) => (
            <li key={l.position} className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{l.title}</span>
                {/* Safe to make a real link: the database only stores https links to known services. */}
                <a href={l.url} target="_blank" rel="noreferrer" className="block truncate text-sm underline opacity-70">
                  {l.url}
                </a>
              </span>
              <button
                type="button"
                disabled={save.busy}
                onClick={() => remove(l)}
                aria-label={`Remove playlist ${l.title}`}
                className="rounded-lg border border-foreground/20 px-3 py-1 text-sm hover:bg-foreground/5 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {links.length >= max ? (
        <p className="text-sm opacity-60">That is {max}. Remove one to add another.</p>
      ) : (
        // noValidate: skip the browser's own url check, which would block a pasted link
        // without "https://" that validateLink can fix, and shows a less helpful message.
        <form onSubmit={add} noValidate className="flex flex-col gap-2">
          <label htmlFor="link-title" className="text-sm opacity-80">
            Playlist name
          </label>
          <input
            id="link-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              save.reset();
            }}
            placeholder="Late night library"
            className="field"
          />
          <label htmlFor="link-url" className="mt-1 text-sm opacity-80">
            Link
          </label>
          <input
            id="link-url"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              save.reset();
            }}
            aria-describedby="link-help"
            placeholder="https://open.spotify.com/playlist/..."
            className="field"
          />
          <p id="link-help" className="text-xs opacity-60">
            {serviceList(hosts)}. Names up to {LINK_TITLE_MAX} characters.
          </p>
          <button type="submit" disabled={save.busy} className="btn mt-1">
            {save.busy ? "Saving..." : `Add playlist (${links.length}/${max})`}
          </button>
        </form>
      )}
      <SaveStatus state={save.state} />
    </div>
  );
}
