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

  // "mh1234@nyu.edu" suggests the handle "mh1234". Only offered if it fits the handle rules
  // and nobody has it; the person can change it.
  const fromEmail = (user.email ?? "").split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 20);
  let suggestedHandle = "";
  if (/^[a-z0-9_]{3,20}$/.test(fromEmail)) {
    const { data: taken } = await supabase.from("profiles").select("id").eq("handle", fromEmail).maybeSingle();
    if (!taken) suggestedHandle = fromEmail;
  }

  const { data: schools } = await supabase
    .from("schools").select("id, name, short_name").order("name");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-3xl font-bold">Pick a handle and school</h1>
        <p className="mt-2 text-sm opacity-70">
          Your handle is how friends find you. Your school decides which charts you count toward.
        </p>
      </div>
      <OnboardingForm userId={user.id} schools={schools ?? []} suggestedHandle={suggestedHandle} />
    </main>
  );
}
