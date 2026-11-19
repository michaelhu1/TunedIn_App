import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Stats · TunedIn", robots: { index: false } };
export const dynamic = "force-dynamic"; // always fresh numbers, never cached

type Daily = { day: string; signups: number; total_signups: number; plays: number; listeners: number; friendships: number };
type Stats = {
  generated_at: string;
  totals: Record<string, number>;
  active: { today: number; this_week: number; this_month: number; listeners_this_week: number };
  schools: { school: string; members: number }[];
  daily: Daily[];
};

// A private page of totals for the person running TunedIn: /admin/stats.
//
// Who may see it is decided by the ADMIN_EMAILS setting on the server (a comma-separated
// list of sign-in emails). A sign-in email cannot be faked, since each one was verified by
// a code or by Google. Everyone else gets "not found", so the page does not even reveal
// that it exists. The numbers themselves are totals only; see *_admin_stats.sql.
export default async function AdminStatsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!user?.email || !admins.includes(user.email.toLowerCase())) notFound();

  const { data, error } = await createAdminClient().rpc("admin_stats");
  if (error || !data) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-10">
        <h1 className="text-2xl font-bold">Stats</h1>
        <p className="mt-2 text-sm opacity-70">
          Could not load the numbers. The database may be missing the latest update (run supabase db push).
        </p>
      </main>
    );
  }
  const s = data as Stats;
  const t = s.totals;
  const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((100 * part) / whole)}%` : "–");
  const last7 = s.daily.slice(-7);
  const prev7 = s.daily.slice(-14, -7);
  const sum = (rows: Daily[], k: keyof Daily) => rows.reduce((n, r) => n + (r[k] as number), 0);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-5 py-10">
      <header>
        <h1 className="text-3xl font-bold">TunedIn in numbers</h1>
        <p className="mt-1 text-sm opacity-60">
          Totals only. Updated {new Date(s.generated_at).toLocaleString("en-US", { timeZone: "America/New_York" })} New York time.
        </p>
      </header>

      <Tiles
        title="People"
        items={[
          ["Sign-ups", t.signups],
          ["Active today", s.active.today, pct(s.active.today, t.signups)],
          ["Active this week", s.active.this_week, pct(s.active.this_week, t.signups)],
          ["Active this month", s.active.this_month, pct(s.active.this_month, t.signups)],
        ]}
      />
      <Tiles
        title="Engagement"
        items={[
          ["Connected their music", t.connected_music, pct(t.connected_music, t.signups)],
          ["Listeners this week", s.active.listeners_this_week, pct(s.active.listeners_this_week, t.signups)],
          ["Friendships made", t.friendships],
          ["Sharing location", t.sharing_location, pct(t.sharing_location, t.signups)],
        ]}
      />
      <Tiles
        title="Music"
        items={[
          ["Plays recorded", t.plays],
          ["From streaming", t.plays_streamed, pct(t.plays_streamed, t.plays)],
          ["Set by hand", t.plays_set_by_hand, pct(t.plays_set_by_hand, t.plays)],
          ["Different songs", t.songs],
        ]}
      />

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-wide opacity-60">Last 7 days against the 7 before</h2>
        <table className="w-full text-sm">
          <tbody>
            {([
              ["New sign-ups", "signups"],
              ["Plays", "plays"],
              ["New friendships", "friendships"],
            ] as [string, keyof Daily][]).map(([label, key]) => (
              <tr key={key} className="border-t border-foreground/10">
                <td className="py-2">{label}</td>
                <td className="py-2 text-right font-semibold tabular-nums">{sum(last7, key).toLocaleString()}</td>
                <td className="py-2 pl-3 text-right tabular-nums opacity-60">was {sum(prev7, key).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Bars title="Total sign-ups, last 30 days" rows={s.daily} value={(d) => d.total_signups} />
      <Bars title="People listening each day" rows={s.daily} value={(d) => d.listeners} />
      <Bars title="Plays each day" rows={s.daily} value={(d) => d.plays} />

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-wide opacity-60">By school</h2>
        <ul className="grid grid-cols-2 gap-x-6 text-sm sm:grid-cols-3">
          {s.schools.map((x) => (
            <li key={x.school} className="flex justify-between border-t border-foreground/10 py-1.5">
              <span>{x.school}</span>
              <span className="tabular-nums opacity-70">{x.members}</span>
            </li>
          ))}
        </ul>
      </section>

      {t.open_reports > 0 && (
        <p className="rounded-xl border border-red-500/40 p-4 text-sm">
          <span className="font-semibold">{t.open_reports} open report{t.open_reports === 1 ? "" : "s"}.</span> Review them in the
          reports table in the Supabase dashboard.
        </p>
      )}

      <p className="text-xs opacity-50">
        Active means opened Home or the Map in that period. Page views and visitors are in Vercel, under
        Analytics.
      </p>
    </main>
  );
}

function Tiles({ title, items }: { title: string; items: [string, number, string?][] }) {
  return (
    <section>
      <h2 className="mb-2 text-xs uppercase tracking-wide opacity-60">{title}</h2>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map(([label, value, note]) => (
          <div key={label} className="rounded-xl border border-foreground/15 p-3">
            <dd className="text-2xl font-bold tabular-nums">{(value ?? 0).toLocaleString()}</dd>
            <dt className="text-xs opacity-60">
              {label}
              {note ? ` · ${note}` : ""}
            </dt>
          </div>
        ))}
      </dl>
    </section>
  );
}

// A plain bar chart drawn with boxes: one bar per day, tallest day fills the height.
function Bars({ title, rows, value }: { title: string; rows: Daily[]; value: (d: Daily) => number }) {
  const max = Math.max(1, ...rows.map(value));
  const last = rows[rows.length - 1];
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xs uppercase tracking-wide opacity-60">{title}</h2>
        <span className="text-sm font-semibold tabular-nums">{last ? value(last).toLocaleString() : 0} today</span>
      </div>
      <div className="flex h-24 items-end gap-0.5" role="img" aria-label={`${title}: ${rows.map((d) => value(d)).join(", ")}`}>
        {rows.map((d) => (
          <div
            key={d.day}
            title={`${d.day}: ${value(d).toLocaleString()}`}
            className="flex-1 rounded-sm bg-foreground/70"
            style={{ height: `${Math.max(2, (100 * value(d)) / max)}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs opacity-50">
        <span>{rows[0]?.day}</span>
        <span>{last?.day}</span>
      </div>
    </section>
  );
}
