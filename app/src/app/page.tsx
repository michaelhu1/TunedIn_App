'use client';

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-3xl font-bold mb-6">Welcome to TunedIn 🎵</h1>
      <a
        href="/api/login"
        className="bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700 transition"
      >
        Log in with Spotify
      </a>
    </main>
  );
}