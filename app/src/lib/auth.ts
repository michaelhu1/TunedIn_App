import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  handle: string;
  avatar_url: string | null;
  school: { name: string; short_name: string; slug: string };
};

// For pages that need a finished account: sends signed-out visitors to /login
// and signed-in people without a profile to /onboarding.
export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("profiles")
    .select("id, handle, avatar_url, school:schools(name, short_name, slug)")
    .eq("id", user.id)
    .maybeSingle();
  if (!data) redirect("/onboarding");
  return data as unknown as Profile;
}
