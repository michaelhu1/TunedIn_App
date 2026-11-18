import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase client for server components and route handlers. It acts as the signed-in
// user (session comes from cookies), so row-level security still applies.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server components cannot write cookies. The middleware refreshes the
            // session on every request, so this is safe to ignore.
          }
        },
      },
    },
  );
}
