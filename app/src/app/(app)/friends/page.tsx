import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import FriendsManager, { type FriendRow } from "./manager";

export default async function FriendsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("my_friendships")
    .select("status, sent_by_me, friend_id, handle, school")
    .order("handle");

  return (
    <main className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Your friends</h1>
        <nav aria-label="People" className="mt-3 flex gap-2 text-sm">
          <Link href="/discover" className="rounded-full border border-foreground/20 px-3 py-1">
            Discover
          </Link>
          <span aria-current="page" className="rounded-full border border-foreground bg-foreground px-3 py-1 text-background">
            Your friends
          </span>
        </nav>
      </header>
      <FriendsManager me={profile.id} myHandle={profile.handle} rows={(data ?? []) as FriendRow[]} />
    </main>
  );
}
