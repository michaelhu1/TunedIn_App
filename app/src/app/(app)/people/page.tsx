import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getFriendsActivity, getPendingRequestCount } from "@/lib/friends";
import { createClient } from "@/lib/supabase/server";
import AutopilotSync from "@/components/autopilot-sync";
import Avatar from "@/components/avatar";
import FriendActivityList from "@/components/friend-activity-list";
import { matchLabel, reasonsFor, type Suggestion } from "@/components/discover/reasons";

// The People tab: your friends first (what each is playing today), then a short row of
// people you might click with. Adding friends and answering requests live behind one
// button, which carries a red badge when someone is waiting on you.
export default async function PeoplePage() {
  const me = await requireProfile();
  const supabase = await createClient();

  const [friends, pending, { data: suggested }] = await Promise.all([
    getFriendsActivity(supabase, me.id),
    getPendingRequestCount(supabase),
    supabase.rpc("people_you_might_click_with", { p_limit: 8 }),
  ]);
  const people = (suggested ?? []) as Suggestion[];

  return (
    <main className="flex flex-col gap-7">
      <AutopilotSync />
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">People</h1>
        <Link
          href="/friends"
          className="relative rounded-full border border-foreground/20 px-4 py-2 text-sm font-semibold"
          aria-label={pending > 0 ? `Add friends and requests, ${pending} waiting` : "Add friends and requests"}
        >
          Add friends
          {pending > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
              {pending}
            </span>
          )}
        </Link>
      </header>

      <section>
        <h2 className="mb-1 text-xs uppercase tracking-wide opacity-60">Friends today</h2>
        {friends.length === 0 ? (
          <div className="rounded-xl border border-foreground/15 p-4 text-sm">
            <p className="font-semibold">No friends here yet.</p>
            <p className="mt-1 opacity-70">
              Add people by their handle, or start with the suggestions below. Once they accept, what they
              are playing shows up here.
            </p>
            <Link href="/friends" className="btn mt-3 block">
              Add friends
            </Link>
          </div>
        ) : (
          <FriendActivityList friends={friends} />
        )}
      </section>

      {people.length > 0 && (
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-xs uppercase tracking-wide opacity-60">People you might click with</h2>
            <Link href="/discover" className="text-sm underline opacity-70">
              See all
            </Link>
          </div>
          {/* A row that scrolls sideways. Each card links to the full profile. */}
          <ul className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-2">
            {people.map((p) => {
              const match = matchLabel(p);
              const reason = reasonsFor(p, 1)[0];
              return (
                <li key={p.user_id} className="w-40 shrink-0 snap-start">
                  <Link
                    href={`/u/${p.handle}`}
                    className="flex h-full flex-col items-center gap-2 rounded-xl border border-foreground/15 p-3 text-center"
                  >
                    <Avatar handle={p.handle} src={p.avatar_url} size={56} />
                    <p className="w-full truncate text-sm font-semibold">{p.display_name ?? `@${p.handle}`}</p>
                    {match && (
                      <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-semibold text-background">{match}</span>
                    )}
                    {reason && <p className="line-clamp-3 text-xs opacity-70">{reason}</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
