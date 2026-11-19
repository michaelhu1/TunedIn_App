import Link from "next/link";

// Shown for a handle that is malformed or that nobody has. Same wording for both, so the
// page does not hint at which handles are reserved or valid.
export default function ProfileNotFound() {
  return (
    <main className="flex flex-col gap-3">
      <h1 className="text-2xl font-bold">Nobody here by that name</h1>
      <p className="text-sm opacity-70">The handle may be misspelled, or the person may have changed it.</p>
      <Link href="/friends" className="underline">
        Find friends by handle
      </Link>
    </main>
  );
}
