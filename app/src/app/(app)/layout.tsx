import { getPendingRequestCount } from "@/lib/friends";
import { createClient } from "@/lib/supabase/server";
import TabBar from "@/components/tab-bar";

// Shared frame for the signed-in part of the app: a phone-width column and the tab bar.
// It also counts friend requests waiting for an answer, so the Home tab can show a red dot.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const pending = await getPendingRequestCount(await createClient()).catch(() => 0);
  return (
    <>
      <div className="mx-auto max-w-md px-5 pb-24 pt-8">{children}</div>
      <TabBar pendingRequests={pending} />
    </>
  );
}
