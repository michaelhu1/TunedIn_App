import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import AppearanceSettings from "@/components/appearance-settings";

export const metadata = { title: "Settings · TunedIn" };

// How the app looks: colour theme and typeface. Both are remembered on this device only.
export default async function SettingsPage() {
  await requireProfile();
  return (
    <main className="flex flex-col gap-6">
      <header>
        <Link href="/me" className="text-sm underline opacity-70">
          Back to Me
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm opacity-70">How TunedIn looks on this phone. Other people do not see these choices.</p>
      </header>
      <AppearanceSettings />
    </main>
  );
}
