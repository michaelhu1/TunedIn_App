import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { PROMPTS, STUDENT_STATUS } from "@/lib/profile-options";
import { createClient } from "@/lib/supabase/server";
import Avatar from "@/components/avatar";
import FriendButton from "@/components/profile/friend-button";
import { labelFor } from "@/components/profile/labels";
import { matchLabel, reasonsFor, type Suggestion } from "@/components/discover/reasons";

// "People you might click with". Who appears and how they are ranked is decided in the
// database (supabase/migrations/*_discover.sql): only people who chose an "Open to" chip,
// never ghosts, blocked people, or existing friends. This page only draws the result.
export default async function DiscoverPage() {
  const me = await requireProfile();
  const supabase = await createClient();

  const [{ data, error }, { data: mine }] = await Promise.all([
    supabase.rpc("people_you_might_click_with", { p_limit: 20 }),
    supabase.from("profiles").select("open_to").eq("id", me.id).maybeSingle(),
  ]);
  if (error) console.error(`discover query failed: ${error.message}`);
  const people = (data ?? []) as Suggestion[];
  const iAmListed = (mine?.open_to ?? []).length > 0;

  return (
    <main className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">People you might click with</h1>
        <Link href="/home" className="mt-2 inline-block text-sm underline opacity-70">
          ← Back to Home
        </Link>
      </header>

      {!iAmListed && (
        <section className="rounded-xl border border-foreground/15 p-4 text-sm">
          <p className="font-semibold">You are not shown here yet.</p>
          <p className="mt-1 opacity-70">
            People only appear on this page after picking what they are open to, like concert buddies or
            playlist swaps. Pick at least one and others will be able to find you too.
          </p>
          <Link href="/me/edit" className="btn mt-3 block">
            Choose what you are open to
          </Link>
        </section>
      )}

      {people.length === 0 ? (
        <p className="text-sm opacity-60">
          Nobody to suggest yet. This fills up as more people at NYU join and say what they are open to.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {people.map((p) => {
            const match = matchLabel(p);
            const badge = labelFor(p.student_status, STUDENT_STATUS);
            const prompt = labelFor(p.prompt_key, PROMPTS);
            return (
              <li key={p.user_id} className="rounded-xl border border-foreground/15 p-4">
                <div className="flex items-start gap-3">
                  <Link href={`/u/${p.handle}`} aria-label={`@${p.handle}'s profile`}>
                    <Avatar handle={p.handle} src={p.avatar_url} size={52} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/u/${p.handle}`} className="block truncate font-semibold">
                      {p.display_name ?? `@${p.handle}`}
                    </Link>
                    <p className="truncate text-sm opacity-60">
                      {p.display_name ? `@${p.handle} · ` : ""}
                      {p.school}
                      {p.class_year ? ` ’${String(p.class_year).slice(-2)}` : ""}
                      {badge ? ` · ${badge}` : ""}
                    </p>
                  </div>
                  {match && (
                    <span className="whitespace-nowrap rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                      {match}
                    </span>
                  )}
                </div>

                <ul className="mt-3 flex flex-col gap-1 text-sm">
                  {reasonsFor(p).map((r) => (
                    <li key={r} className="opacity-80">
                      {r}
                    </li>
                  ))}
                </ul>

                {prompt && p.prompt_answer && (
                  <p className="mt-3 text-sm">
                    <span className="opacity-60">{prompt}: </span>
                    <span className="font-medium">“{p.prompt_answer}”</span>
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <FriendButton me={me.id} friendId={p.user_id} handle={p.handle} state="none" />
                  <Link href={`/u/${p.handle}`} className="text-sm underline opacity-70">
                    View profile
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs opacity-50">
        Suggestions are based on the artists you both play, what you are both open to, shared genres and
        concerts. People who hide their stats can still appear, without a match score.
      </p>
    </main>
  );
}
