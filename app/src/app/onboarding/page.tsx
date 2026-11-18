import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingForm from "./form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: existing } = await supabase
    .from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (existing) redirect("/home");

  const { data: schools } = await supabase
    .from("schools").select("id, name, short_name").order("name");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-3xl font-bold">Set up your profile</h1>
        <p className="mt-2 text-sm opacity-70">
          Your handle is how friends find you. Your school decides which charts you count toward.
        </p>
      </div>
      <OnboardingForm userId={user.id} schools={schools ?? []} />
    </main>
  );
}
