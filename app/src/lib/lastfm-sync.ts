import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getListeningSource } from "@/lib/sources";
import { SourceError, type Listen } from "@/lib/sources/types";
import { resolveTrack } from "@/lib/tracks";

// The reader: pulls one person's new plays from Last.fm into TunedIn.
//
//   1. Ask Last.fm for plays since the newest one we already have (the "cursor").
//   2. Match each song to our track list (cached after the first time a spelling is seen).
//   3. Record the plays, oldest first, and move the cursor forward.
//   4. Set their "now playing" from what Last.fm says is playing, or their latest play.
//
// It is safe to run as often as you like: plays are unique per (person, song, time), so
// importing the same play twice does nothing.

const FIRST_IMPORT_DAYS = 7; // how far back to look the first time someone connects
const MAX_PLAYS_PER_RUN = 200; // Last.fm's page size
const TIME_BUDGET_MS = 7_000; // stop matching songs after this long; the next run continues

export type SyncTarget = { userId: string; username: string; cursor: string | null };
export type SyncResult = {
  status: "ok" | "not_found" | "private" | "error";
  imported: number;
  nowPlaying: boolean;
};

export async function syncLastfmUser(admin: SupabaseClient, target: SyncTarget): Promise<SyncResult> {
  const started = Date.now();
  const since = target.cursor
    ? new Date(target.cursor)
    : new Date(Date.now() - FIRST_IMPORT_DAYS * 86_400_000);

  const finish = async (result: SyncResult, cursor?: Date) => {
    await admin
      .from("user_settings")
      .update({
        lastfm_synced_at: new Date().toISOString(),
        lastfm_status: result.status,
        ...(cursor ? { lastfm_cursor: cursor.toISOString() } : {}),
      })
      .eq("user_id", target.userId);
    return result;
  };

  let listens: Listen[];
  try {
    listens = await getListeningSource().getRecentListens(target.username, { limit: MAX_PLAYS_PER_RUN, since });
  } catch (err) {
    const kind = err instanceof SourceError ? err.kind : "unavailable";
    const status = kind === "not_found" ? "not_found" : kind === "private" ? "private" : "error";
    return finish({ status, imported: 0, nowPlaying: false });
  }

  const live = listens.find((l) => l.nowPlaying) ?? null;
  // Oldest first, so if we run out of time the cursor still marks a clean "done up to here".
  const scrobbles = listens
    .filter((l): l is Listen & { playedAt: Date } => !l.nowPlaying && l.playedAt !== null)
    .sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());

  const rows: { user_id: string; track_id: string; played_at: string; source: "lastfm" }[] = [];
  let cursor: Date | undefined;
  let latest: { trackId: string; playedAt: Date } | null = null;

  for (const s of scrobbles) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    let trackId: string | null;
    try {
      trackId = await resolveTrack(admin, s.track);
    } catch {
      break; // the song catalogue is busy or down: keep what we have, retry the rest next run
    }
    if (trackId) {
      rows.push({ user_id: target.userId, track_id: trackId, played_at: s.playedAt.toISOString(), source: "lastfm" });
      latest = { trackId, playedAt: s.playedAt };
    }
    cursor = s.playedAt;
  }

  if (rows.length > 0) {
    const { error } = await admin
      .from("plays")
      .upsert(rows, { onConflict: "user_id,track_id,played_at", ignoreDuplicates: true });
    if (error) return finish({ status: "error", imported: 0, nowPlaying: false });
  }

  // Now playing: what is on right now wins; otherwise their most recent play today.
  let nowPlaying = false;
  if (live && Date.now() - started <= TIME_BUDGET_MS + 2_000) {
    const liveId = await resolveTrack(admin, live.track).catch(() => null);
    if (liveId) {
      await admin.rpc("set_presence_from_play", {
        p_user_id: target.userId, p_track_id: liveId, p_played_at: new Date().toISOString(), p_live: true,
      });
      nowPlaying = true;
    }
  }
  if (!nowPlaying && latest) {
    await admin.rpc("set_presence_from_play", {
      p_user_id: target.userId, p_track_id: latest.trackId, p_played_at: latest.playedAt.toISOString(), p_live: false,
    });
  }

  return finish({ status: "ok", imported: rows.length, nowPlaying }, cursor);
}

/** How stale someone's data must be before we ask Last.fm again. Keeps us polite to their API. */
export const MIN_SECONDS_BETWEEN_SYNCS = 45;

export function isStale(syncedAt: string | null): boolean {
  return !syncedAt || Date.now() - new Date(syncedAt).getTime() > MIN_SECONDS_BETWEEN_SYNCS * 1000;
}
