import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import CheckinSearch from "./search";

export default async function CheckinPage() {
  await requireProfile();
  return (
    <main className="flex flex-col gap-4">
      <Link href="/home" className="text-sm underline opacity-70">Back</Link>
      <h1 className="text-2xl font-bold">What are you listening to?</h1>
      <CheckinSearch />
    </main>
  );
}
