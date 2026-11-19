import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Runs before every page. Two jobs:
//   1. Refresh the Supabase session cookie so people stay signed in.
//   2. Keep signed-out visitors out of the app, and signed-in people off the login page.
// /api/cron/* is called by the scheduler, not a browser, and checks its own secret.
// Whole sections anyone may open: the public charts (/nyu, /nyu/<school>), the privacy
// policy, and invite links (/invite/<handle>).
const PUBLIC_PREFIXES = ["/nyu", "/privacy", "/invite"];
const PUBLIC_PATHS = ["/", "/login", "/icon", "/apple-icon", "/manifest.webmanifest", "/api/cron/lastfm"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getUser() checks the token with the auth server, so a forged cookie does not pass.
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  const redirectTo = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  const isPublic = PUBLIC_PATHS.includes(path) || PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
  if (!user && !isPublic) return redirectTo("/login");
  if (user && (path === "/login" || path === "/")) return redirectTo("/home");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|jpg|svg|ico|webp|mjs)$).*)"],
};
