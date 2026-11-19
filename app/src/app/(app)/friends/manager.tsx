"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Avatar from "@/components/avatar";
import ShareButton from "@/components/share-button";
import { createClient } from "@/lib/supabase/client";
import { HANDLE_PATTERN } from "@/lib/validation";

export type FriendRow = {
  status: "pending" | "accepted";
  sent_by_me: boolean;
  friend_id: string;
  handle: string;
  school: string;
  avatar_url?: string | null;
};

// All friend actions go straight from the browser to the database. The row-level security
// policies decide what is allowed: you can only send requests as yourself, only the person
// you asked can accept, and either side can remove the friendship.
export default function FriendsManager({ me, myHandle, rows }: { me: string; myHandle: string; rows: FriendRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [handle, setHandle] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Removing a friend takes a second tap, so it cannot happen by accident.
  const [confirming, setConfirming] = useState<string | null>(null);

  const incoming = rows.filter((r) => r.status === "pending" && !r.sent_by_me);
  const outgoing = rows.filter((r) => r.status === "pending" && r.sent_by_me);
  const friends = rows.filter((r) => r.status === "accepted");

  async function run(action: () => Promise<string | null>, okText?: string) {
    setBusy(true);
    setMessage(null);
    const problem = await action();
    setBusy(false);
    if (problem) setMessage({ kind: "error", text: problem });
    else if (okText) setMessage({ kind: "ok", text: okText });
    router.refresh();
  }

  const add = () =>
    run(async () => {
      const wanted = handle.trim().toLowerCase().replace(/^@/, "");
      if (!HANDLE_PATTERN.test(wanted)) return "Enter a handle, like @maya.";
      if (wanted === myHandle) return "That is you.";
      const { data: target } = await supabase.from("profiles").select("id").eq("handle", wanted).maybeSingle();
      if (!target) return `Nobody here is called @${wanted} yet.`;
      const { error } = await supabase.from("friendships").insert({ requester_id: me, addressee_id: target.id });
      // 23505 = a row for this pair already exists, in either direction.
      if (error?.code === "23505") return "You are already friends, or a request is waiting.";
      if (error) return "Could not send the request. Try again.";
      setHandle("");
      return null;
    }, "Request sent.");

  const accept = (friendId: string) =>
    run(async () => {
      const { error } = await supabase
        .from("friendships")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("requester_id", friendId)
        .eq("addressee_id", me);
      return error ? "Could not accept. Try again." : null;
    });

  // Decline, cancel and unfriend are all the same thing: delete the row for this pair.
  const remove = (friendId: string) =>
    run(async () => {
      const { error } = await supabase
        .from("friendships")
        .delete()
        .or(`and(requester_id.eq.${me},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${me})`);
      return error ? "Could not update. Try again." : null;
    });

  return (
    <div className="flex flex-col gap-7">
      {incoming.length > 0 && (
        <Section title="Requests">
          {incoming.map((r) => (
            <Row key={r.friend_id} row={r}>
              <button disabled={busy} onClick={() => accept(r.friend_id)} className="btn px-3 py-1.5 text-sm">Accept</button>
              <button disabled={busy} onClick={() => remove(r.friend_id)} className="text-sm underline opacity-70">Decline</button>
            </Row>
          ))}
        </Section>
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label htmlFor="add-friend" className="text-xs uppercase tracking-wide opacity-60">Add a friend by handle</label>
        <div className="flex gap-2">
          <input
            id="add-friend"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="@handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            className="field min-w-0 flex-1"
          />
          <button type="submit" disabled={busy || !handle.trim()} className="btn px-4">Add</button>
        </div>
        <p className="text-xs opacity-60">Your handle is @{myHandle}. Friends can add you with it.</p>
        <div className="flex items-center gap-3 pt-1">
          <ShareButton path={`/invite/${myHandle}`} title="Join me on TunedIn" label="Invite a friend" />
          <span className="text-xs opacity-60">Sends your link. Anyone who joins with it asks to be your friend.</span>
        </div>
        {message && (
          <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-red-500" : "opacity-80"}`}>
            {message.text}
          </p>
        )}
      </form>

      <Section title={`Friends (${friends.length})`}>
        {friends.length === 0 && (
          <p className="text-sm opacity-60">No friends yet. Add someone above and their music shows up on Home and the map.</p>
        )}
        {friends.map((r) => (
          <Row key={r.friend_id} row={r}>
            {confirming === r.friend_id ? (
              <>
                <button disabled={busy} onClick={() => remove(r.friend_id)} className="text-sm font-semibold text-red-500 underline">
                  Remove
                </button>
                <button disabled={busy} onClick={() => setConfirming(null)} className="text-sm underline opacity-60">
                  Keep
                </button>
              </>
            ) : (
              <button disabled={busy} onClick={() => setConfirming(r.friend_id)} className="text-sm underline opacity-60">
                Remove
              </button>
            )}
          </Row>
        ))}
      </Section>

      {outgoing.length > 0 && (
        <Section title="Waiting for them">
          {outgoing.map((r) => (
            <Row key={r.friend_id} row={r}>
              <button disabled={busy} onClick={() => remove(r.friend_id)} className="text-sm underline opacity-60">Cancel</button>
            </Row>
          ))}
        </Section>
      )}
      <p className="text-sm opacity-60">
        To block or report someone, open their profile and scroll to the bottom. People you have blocked are
        listed under{" "}
        <Link href="/me#blocked" className="underline">
          Me
        </Link>
        .
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs uppercase tracking-wide opacity-60">{title}</h2>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

function Row({ row, children }: { row: FriendRow; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <Link href={"/u/" + row.handle} aria-hidden tabIndex={-1}>
        <Avatar handle={row.handle} src={row.avatar_url} size={36} />
      </Link>
      <p className="min-w-0 flex-1 truncate">
        <Link href={"/u/" + row.handle} className="font-medium hover:underline">@{row.handle}</Link>
        <span className="opacity-60"> · {row.school}</span>
      </p>
      {children}
    </li>
  );
}
