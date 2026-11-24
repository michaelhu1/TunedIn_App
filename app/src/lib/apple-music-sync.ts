import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AppleMusicAuthError,
  countNewPlays,
  estimatePlayTimes,
  getRecentlyPlayed,
  type AppleTrack,
} from "@/lib/sources/apple-music";
import { getServerDeveloperToken } from "@/lib/sources/apple-music-token";
import { resolveTrack } from "@/lib/tracks";

// The Apple Music reader: pulls one person's new plays into TunedIn. The counterpart of
// lastfm-sync.ts, and it writes to the same places (plays, then "now playing").
//
//   1. Ask Apple for the person's recently played list.
//   2. Compare it with the list from last time. What is new at the top was played since.
//   3. Match each new song to our track list and record it, oldest first.
//   4. Remember the list for next time, and set their current song from the newest play.
//
// Apple gives no play times, so each play is dated by estimate (see estimatePlayTimes).
// With a look every minute or so that is accurate to about a minute.
//
// The very first look after connecting only remembers the list. Those songs could have
// been played a minute or a month ago, and guessing would put old plays on today's charts.

const TIME_BUDGET_MS = 7_000; // stop matching songs after this long; the next run continues

export type AppleSyncTarget = { userId: string; syncedAt: string | null };
export type AppleSyncResult = { status: "ok" | "expired" | "error"; imported: number; nowPlaying: boolean };

export async function syncAppleMusicUser(admin: SupabaseClient, target: AppleSyncTarget): Promise<AppleSyncResult> {
  const started = Date.now();
  const now = new Date(started);

  const finish = async (result: AppleSyncResult, recentIds?: string[]) => {
    if (recentIds) {
      await admin.from("apple_music_links").update({ recent_ids: recentIds }).eq("user_id", target.userId);
    }
    await admin
      .from("user_settings")
      .update({ apple_music_synced_at: now.toISOString(), apple_music_status: result.status })
      .eq("user_id", target.userId);
    return result;
  };
  const failed = (status: "expired" | "error") => finish({ status, imported: 0, nowPlaying: false });

  const developerToken = getServerDeveloperToken();
  const { data: link } = await admin
    .from("apple_music_links")
    .select("music_user_token, recent_ids")
    .eq("user_id", target.userId)
    .maybeSingle();
  if (!developerToken || !link) return failed("error");

  let recent: AppleTrack[];
  try {
    recent = await getRecentlyPlayed({ developerToken, musicUserToken: link.music_user_token });
  } catch (err) {
    return failed(err instanceof AppleMusicAuthError ? "expired" : "error");
  }
  const currentIds = recent.map((t) => t.id);

  // First look: remember the list, import nothing.
  const previousIds = link.recent_ids as string[] | null;
  if (!previousIds || !target.syncedAt) return finish({ status: "ok", imported: 0, nowPlaying: false }, currentIds);

  const newCount = countNewPlays(previousIds, currentIds);
  if (newCount === 0) return finish({ status: "ok", imported: 0, nowPlaying: false }, currentIds);

  const fresh = recent.slice(0, newCount); // newest first
  const times = estimatePlayTimes(fresh.map((t) => t.durationMs), new Date(target.syncedAt), now);

  // Oldest first, so if we run out of time what is left is a clean "newest N still to do".
  const rows: { user_id: string; track_id: string; played_at: string; source: "apple_music" }[] = [];
  let latest: { trackId: string; playedAt: Date } | null = null;
  let done = 0;
  for (let i = newCount - 1; i >= 0; i--) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const t = fresh[i];
    let trackId: string | null;
    try {
      trackId = await resolveTrack(admin, { artist: t.artist, title: t.title, album: t.album });
    } catch {
      break; // the song catalogue is busy or down: keep what we have, retry the rest next run
    }
    if (trackId) {
      rows.push({ user_id: target.userId, track_id: trackId, played_at: times[i].toISOString(), source: "apple_music" });
      latest = { trackId, playedAt: times[i] };
    }
    done++;
  }

  if (rows.length > 0) {
    const { error } = await admin
      .from("plays")
      .upsert(rows, { onConflict: "user_id,track_id,played_at", ignoreDuplicates: true });
    if (error) return failed("error");
  }

  // Their current song: the newest play, but only once everything up to it is recorded.
  let nowPlaying = false;
  if (latest && done === newCount) {
    await admin.rpc("set_presence_from_play", {
      p_user_id: target.userId, p_track_id: latest.trackId, p_played_at: latest.playedAt.toISOString(), p_live: false,
    });
    nowPlaying = true;
  }

  // Remember the list only as far as we got: the songs not yet handled are left off the
  // top, so the next run sees them as new again.
  return finish({ status: "ok", imported: rows.length, nowPlaying }, currentIds.slice(newCount - done));
}
