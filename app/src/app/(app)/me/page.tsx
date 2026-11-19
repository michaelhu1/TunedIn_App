import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMyStats } from "@/lib/my-stats";
import MyListening, { RANGE_DAYS, type RangeKey } from "@/components/my-listening";
import ProfileScreen from "@/components/profile/profile-screen";

// Me: your own profile, exactly as others see it, with Edit and Share under the bio and
// your private listening numbers at the end. Everything you set once and rarely touch
// (looks, privacy, Last.fm, blocked people, account) is in Settings, behind the gear.
export default async function MePage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const wanted = (await searchParams).range;
  const range: RangeKey = wanted === "month" || wanted === "all" ? wanted : "week";
  const stats = await getMyStats(supabase, profile.id, RANGE_DAYS[range]);

  return <ProfileScreen viewerId={profile.id} handle={profile.handle} ownListening={<MyListening stats={stats} range={range} />} />;
}
