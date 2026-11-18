import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SourceError } from "@/lib/sources/types";

export const jsonError = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status });

/** The signed-in user's id plus a client acting as them, or null if signed out. */
export async function getSessionUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { userId: user.id, supabase } : null;
}

/** Turn a music-source failure into a response the UI can show. */
export function sourceErrorResponse(err: unknown) {
  if (err instanceof SourceError) {
    if (err.kind === "rate_limited") return jsonError(503, "The music service is busy. Try again in a minute.");
    if (err.kind === "unavailable") return jsonError(502, "The music service is not responding. Try again.");
  }
  console.error(err);
  return jsonError(500, "Something went wrong.");
}
