import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { HANDLE_PATTERN } from "@/lib/validation";
import ProfileScreen from "@/components/profile/profile-screen";

type Props = { params: Promise<{ handle: string }> };

// The tab title comes from the address only, so it costs no database query. It is not
// sensitive: whoever opened the page already typed or tapped that handle.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const handle = (await params).handle.toLowerCase();
  return { title: HANDLE_PATTERN.test(handle) ? `@${handle} · TunedIn` : "TunedIn" };
}

// Someone else's profile. Your own lives on the Me tab, so your own handle goes there.
export default async function ProfilePage({ params }: Props) {
  const viewer = await requireProfile(); // signed-out visitors go to /login
  // Check the shape before touching the database, so junk in the address never reaches a query.
  const handle = (await params).handle.toLowerCase();
  if (!HANDLE_PATTERN.test(handle)) notFound();
  if (handle === viewer.handle) redirect("/me");
  return <ProfileScreen viewerId={viewer.id} handle={handle} />;
}
