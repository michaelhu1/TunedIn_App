"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const REASONS = [
  { key: "harassment", label: "Harassment or bullying" },
  { key: "inappropriate", label: "Inappropriate photo or text" },
  { key: "impersonation", label: "Pretending to be someone else" },
  { key: "spam", label: "Spam" },
  { key: "other", label: "Something else" },
] as const;
const DETAILS_MAX = 500;

// "Block" and "Report" at the bottom of someone else's profile. Both write straight to the
// database as the viewer; row-level security only lets you create blocks and reports as
// yourself. What a block does (ends the friendship, hides you from each other) happens in
// the database, in supabase/migrations/*_report_and_block.sql.
export default function SafetyMenu({ me, userId, handle }: { me: string; userId: string; handle: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<"none" | "block" | "report">("none");
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);

  const supabase = createClient();

  async function block(): Promise<boolean> {
    const { error } = await supabase.from("blocks").insert({ blocker_id: me, blocked_id: userId });
    // 23505 = already blocked, which is the outcome we wanted anyway.
    return !error || error.code === "23505";
  }

  async function confirmBlock() {
    setBusy(true);
    setError(null);
    if (!(await block())) {
      setBusy(false);
      setError("Could not block. Try again.");
      return;
    }
    // Their profile no longer exists for us, so leave the page.
    router.replace("/people");
    router.refresh();
  }

  async function sendReport(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) {
      setError("Pick what is wrong.");
      return;
    }
    setBusy(true);
    setError(null);
    // No .select() here on purpose: members can file reports but never read them back.
    const { error } = await supabase.from("reports").insert({
      reporter_id: me,
      reported_user_id: userId,
      reason,
      details: details.trim() || null,
    });
    // 23505 = you already have an open report about this person. That still counts as reported.
    if (error && error.code !== "23505") {
      setBusy(false);
      setError("Could not send the report. Try again.");
      return;
    }
    if (alsoBlock) {
      await block();
      router.replace("/people");
      router.refresh();
      return;
    }
    setBusy(false);
    setReported(true);
    setOpen("none");
  }

  if (reported) {
    return (
      <p role="status" className="text-sm opacity-70">
        Thanks. Your report was sent and @{handle} will not be told it was you.
      </p>
    );
  }

  return (
    <section aria-label="Safety" className="flex flex-col gap-3 border-t border-foreground/10 pt-4 text-sm">
      {open === "none" && (
        <div className="flex gap-4">
          <button type="button" onClick={() => setOpen("block")} className="underline opacity-60">
            Block @{handle}
          </button>
          <button type="button" onClick={() => setOpen("report")} className="underline opacity-60">
            Report @{handle}
          </button>
        </div>
      )}

      {open === "block" && (
        <div className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-4">
          <p className="font-semibold">Block @{handle}?</p>
          <p className="opacity-70">
            You will stop being friends, and neither of you will be able to find the other&apos;s profile, see each
            other on the map or send friend requests. They are not told. You can undo this under Me.
          </p>
          <div className="flex gap-3">
            <button type="button" disabled={busy} onClick={confirmBlock} className="btn bg-red-600 px-4 text-white">
              {busy ? "Blocking..." : "Block"}
            </button>
            <button type="button" disabled={busy} onClick={() => setOpen("none")} className="underline opacity-70">
              Cancel
            </button>
          </div>
        </div>
      )}

      {open === "report" && (
        <form onSubmit={sendReport} className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-4">
          <p className="font-semibold">Report @{handle}</p>
          <p className="opacity-70">
            This goes to the people who run TunedIn, along with a copy of what this profile says right now.
            @{handle} is not told who reported them.
          </p>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 opacity-80">What is wrong?</legend>
            {REASONS.map((r) => (
              <label key={r.key} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="report-reason"
                  value={r.key}
                  checked={reason === r.key}
                  onChange={() => setReason(r.key)}
                  className="accent-current"
                />
                {r.label}
              </label>
            ))}
          </fieldset>
          <label htmlFor="report-details" className="opacity-80">
            Anything else we should know? (optional)
          </label>
          <textarea
            id="report-details"
            rows={3}
            maxLength={DETAILS_MAX}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className="field"
          />
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} className="accent-current" />
            Also block @{handle}
          </label>
          <div className="flex gap-3">
            <button type="submit" disabled={busy} className="btn px-4">
              {busy ? "Sending..." : "Send report"}
            </button>
            <button type="button" disabled={busy} onClick={() => setOpen("none")} className="underline opacity-70">
              Cancel
            </button>
          </div>
          <p className="text-xs opacity-60">
            If someone is in danger, contact NYU Campus Safety at 212-998-2222 or call 911.
          </p>
        </form>
      )}

      {error && <p role="alert" className="text-red-500">{error}</p>}
    </section>
  );
}
