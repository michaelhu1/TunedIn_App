import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import FriendsManager, { type FriendRow } from "./manager";

export default async function FriendsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ data }, { data: overlap }] = await Promise.all([
    supabase.from("my_friendships").select("status, sent_by_me, friend_id, handle, school, avatar_url").order("handle"),
    supabase.rpc("friend_overlap"),
  ]);
  // People whose listening overlaps most with yours come first, then by handle. This order
  // is yours alone: nobody can see where they sit in anyone else's list.
  const shared = new Map(((overlap ?? []) as { friend_id: string; shared_artists: number }[]).map((o) => [o.friend_id, o.shared_artists]));
  const rows = ((data ?? []) as FriendRow[]).sort((a, b) => (shared.get(b.friend_id) ?? 0) - (shared.get(a.friend_id) ?? 0));

  return (
    <main className="flex flex-col gap-6">
      <header>
        <Link href="/home" className="text-sm underline opacity-70">
          ← Back to Home
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Friends</h1>
      </header>
      <FriendsManager me={profile.id} myHandle={profile.handle} rows={rows} />
    </main>
  );
}
