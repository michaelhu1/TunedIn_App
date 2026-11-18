import { createBrowserClient } from "@supabase/ssr";

// Supabase client for code that runs in the browser. It uses the public anon key,
// so it can only do what the row-level security policies allow for the signed-in user.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
