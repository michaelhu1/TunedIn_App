import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /auth/callback?code=...
// Where Google sign-in lands. Google sends the person to Supabase, Supabase checks them and
// sends them here with a one-time code, and we swap that code for a signed-in session.
//
// The NYU-only rule is not enforced here: the database refuses to create an account for any
// email that is not at nyu.edu, whichever way someone signs in. If that happens (a personal
// Google account was picked), we land back on the sign-in page with an explanation.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?error=${reason}`, url.origin));

  if (url.searchParams.get("error")) {
    const detail = `${url.searchParams.get("error_description") ?? ""} ${url.searchParams.get("error_code") ?? ""}`.toLowerCase();
    // "Database error saving new user" is how the NYU-only rule surfaces through Supabase.
    return fail(detail.includes("database error") || detail.includes("unexpected_failure") ? "not_nyu" : "google");
  }

  const code = url.searchParams.get("code");
  if (!code) return fail("google");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail("google");

  // /home sends brand new people on to pick a handle and school.
  return NextResponse.redirect(new URL("/home", url.origin));
}
