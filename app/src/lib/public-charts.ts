import "server-only";
import { getChartStatus, getSchools, getTopArtists, getTopTracks } from "@/lib/charts";
import { createAdminClient } from "@/lib/supabase/admin";

// Data for the public charts pages (/nyu and /nyu/<school>), which anyone can open without
// signing in. Deliberately limited to what is already anonymous:
//   * top songs and artists, with how many people played each;
//   * the school leaderboard.
// No handles, no "top listeners", nothing about any one person. The usual rule still
// applies: a chart only exists once enough different people are in it.
//
// These pages have no signed-in user, so the queries run with the server's own key. That is
// safe here precisely because only the aggregate chart functions are called.
export async function getPublicChart(school: string | null) {
  const admin = createAdminClient();
  const [status, tracks, artists, schools] = await Promise.all([
    getChartStatus(admin, school),
    getTopTracks(admin, school, 7, 10),
    getTopArtists(admin, school, 7, 5),
    getSchools(admin),
  ]);
  const current = school ? schools.find((s) => s.slug === school) ?? null : null;
  return { status, tracks, artists, schools, current };
}
