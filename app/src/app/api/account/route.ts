import { NextResponse } from "next/server";
import { getSessionUser, jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

// DELETE /api/account
// Deletes the signed-in person's account for good. The database is set up so that removing
// the account removes everything tied to it in the same step: profile, settings, plays,
// friendships, blocks, favourites, links, concerts and location. Reports they filed are
// kept without their name. Their photos are removed from storage first, since files are
// not covered by that automatic cleanup.
export async function DELETE() {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in first.");
  const admin = createAdminClient();

  const bucket = admin.storage.from("avatars");
  const { data: files } = await bucket.list(session.userId);
  if (files?.length) await bucket.remove(files.map((f) => `${session.userId}/${f.name}`));

  const { error } = await admin.auth.admin.deleteUser(session.userId);
  if (error) {
    console.error(error);
    return jsonError(500, "Could not delete your account. Try again.");
  }
  await session.supabase.auth.signOut().catch(() => {});
  return NextResponse.json({ ok: true });
}
