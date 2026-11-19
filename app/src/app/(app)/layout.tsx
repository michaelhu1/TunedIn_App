import { getPendingRequestCount } from "@/lib/friends";
import { createClient } from "@/lib/supabase/server";
import InviteClaim from "@/components/invite-claim";
import TabBar from "@/components/tab-bar";

// Shared frame for the signed-in part of the app: a phone-width column and the tab bar.
// It also counts friend requests waiting for an answer, so the Home tab can show a red dot,
// and sends the friend request for an invite link the person opened before signing up.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [pending, { data: profile }] = await Promise.all([
    getPendingRequestCount(supabase).catch(() => 0),
    user
      ? supabase.from("profiles").select("id, handle").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return (
    <>
      <div className="mx-auto max-w-md px-5 pb-24 pt-8">
        {profile && <InviteClaim me={profile.id} myHandle={profile.handle} />}
        {children}
      </div>
      <TabBar pendingRequests={pending} />
    </>
  );
}
