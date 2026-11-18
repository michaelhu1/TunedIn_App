import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-4xl font-bold">TunedIn</h1>
      <p className="max-w-md text-lg opacity-80">
        See what your friends nearby are listening to right now, and what NYU has on repeat.
      </p>
      <Link href="/login" className="btn mt-2 px-6">
        Join with your NYU email
      </Link>
    </main>
  );
}
