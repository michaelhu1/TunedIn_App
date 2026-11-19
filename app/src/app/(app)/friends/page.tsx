import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import FriendsManager, { type FriendRow } from "./manager";

export default async function FriendsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("my_friendships")
    .select("status, sent_by_me, friend_id, handle, school, avatar_url")
    .order("handle");

  return (
    <main className="flex flex-col gap-6">
      <header>
        <Link href="/home" className="text-sm underline opacity-70">
          ← Back to Home
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Friends</h1>
      </header>
      <FriendsManager me={profile.id} myHandle={profile.handle} rows={(data ?? []) as FriendRow[]} />
    </main>
  );
}
