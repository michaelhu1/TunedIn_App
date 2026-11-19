import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy · TunedIn",
  description: "What TunedIn collects, who can see it, and how to delete it.",
};

const UPDATED = "November 19, 2026";

// The privacy policy, written to be read. Every statement here describes how the code in
// this repository actually behaves; if the code changes, change this page with it.
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-8 text-sm leading-relaxed">
      <header>
        <Link href="/" className="font-semibold opacity-70">
          TunedIn
        </Link>
        <h1 className="mt-1 text-3xl font-bold">Privacy</h1>
        <p className="mt-1 opacity-60">Last updated {UPDATED}</p>
      </header>

      <p>
        TunedIn is a free, open-source app for NYU students that shows what you and your friends are listening
        to. It is a student project, not a company. There are no ads and nothing is sold. The code is public, so anyone can check that this page is true.
      </p>

      <Section title="What we store">
        <Item name="Your NYU email">Used only to sign you in with a one-time code. Other members never see it.</Item>
        <Item name="Your profile">
          Handle, school, and whatever you choose to add: photo, name, bio, class year, prompt, tags, concerts,
          playlist links and Instagram handle.
        </Item>
        <Item name="What you listen to">
          Plays read from your public Last.fm profile if you connect one, and songs you set by hand. Playing a
          30-second preview inside TunedIn is not recorded.
        </Item>
        <Item name="Your friends">Who you are friends with, pending requests, anyone you have blocked, and each “felt this” you send a friend about their song.</Item>
        <Item name="Your rough location, only if you turn it on">
          A zone about 1 km wide. Your phone rounds your position before sending it, so we never receive your
          exact location. We keep only your latest zone, not a history, and it is cleared at the end of each
          day. It is read only while you have the app open.
        </Item>
        <Item name="Reports">If you report someone, your report and a copy of their profile at that moment.</Item>
      </Section>

      <Section title="Who can see what">
        <Item name="Anyone on the internet">
          Only totals: the public charts (top songs, artists and school rankings). Nobody is named, and a chart
          appears only when at least 5 different people are in it.
        </Item>
        <Item name="Signed-in NYU members">
          Your profile. Your top songs and artists too, unless you hide them. Your handle on the top listeners
          list, unless you are in ghost mode. And anonymous totals for busy areas on the public map, such as
          &quot;12 listening around Washington Square&quot;, which never say who.
        </Item>
        <Item name="Your friends">The song you are playing today, your zone on the map if you share location, and when the two of you played the same song on the same day. Friends also get a friends chart and leaderboard: which songs you played this week and how many, unless you hide your stats in Edit profile or turn on ghost mode. A “felt this” is seen only by the friend you send it to.</Item>
        <Item name="Only you">Your full listening history, your email and your settings.</Item>
        <Item name="The person running TunedIn">
          Can see the database in order to run the service and review reports. Reports are never shown to the
          person reported.
        </Item>
      </Section>

      <Section title="Your controls">
        <Item name="Ghost mode">Hides your song and location from friends and removes you from all totals that could show you.</Item>
        <Item name="Location">Off until you turn it on. You can share with friends but stay out of public area totals.</Item>
        <Item name="Stats">One switch hides your top songs and artists from your profile.</Item>
        <Item name="Block and report">On anyone&apos;s profile. Blocking hides you from each other everywhere.</Item>
        <Item name="Delete your account">
          In Settings. It removes your profile, photo, plays, friends and location immediately and for good.
        </Item>
      </Section>

      <Section title="Services we rely on">
        <p>
          Your data is stored with Supabase (database, sign-in and photos) and the app is hosted on Vercel.
          Sign-in codes are sent by email. To show music we ask Last.fm for the public listening history of the
          username you give us, and Deezer, Apple&apos;s iTunes search and Spotify for song details, artwork and
          links; those requests contain song names, not who you are. When you add a playlist link, we ask that service (Spotify, YouTube and the like) for the playlist&apos;s cover picture, which tells it the playlist&apos;s address but not whose profile it is on. Map images load directly from
          OpenFreeMap, which, like any website, sees your device&apos;s internet address when it does.
        </p>
      </Section>

      <Section title="Counting visits">
        <p>
          We count page views using Vercel Web Analytics, to know how many people use TunedIn. It sets no
          cookies and does not identify you or follow you to other sites. Addresses that contain a handle are
          recorded without the handle. Separately, the person running TunedIn can see totals from the
          database, such as how many people have signed up and how many songs have been played.
        </p>
      </Section>

      <Section title="Research and data sharing">
        <p>
          We do not publish or share anyone&apos;s individual data, including in &quot;anonymized&quot; form. Only the
          totals described above are public. If that ever changes, it will be by asking you first, with a
          switch that starts off.
        </p>
      </Section>

      <Section title="Questions">
        <p>
          Open an issue on the project&apos;s{" "}
          <a href="https://github.com/michaelhu1/TunedIn_App/issues" className="underline" target="_blank" rel="noreferrer noopener">
            GitHub page
          </a>
          . TunedIn is not affiliated with NYU, Spotify, Apple, Deezer or Last.fm.
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Item({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <p>
      <span className="font-semibold">{name}.</span> {children}
    </p>
  );
}
