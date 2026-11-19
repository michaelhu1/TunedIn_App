import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HANDLE_PATTERN } from "@/lib/validation";
import RememberInvite from "./remember";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  return {
    title: `@${handle} invited you to TunedIn`,
    description: "See what your friends at NYU are listening to.",
  };
}

// An invite link: /invite/<handle>. Anyone can open it.
//
// It deliberately shows nothing about the person except the handle that is already in the
// link: profiles are for signed-in members only, so we do not look the inviter up here.
// If the visitor signs up, a friend REQUEST to the inviter is created for them (see
// src/components/invite-claim.tsx). The inviter still has to accept, so a link that ends up
// in the wrong hands cannot make a stranger anyone's friend.
export default async function InvitePage({ params }: Props) {
  const handle = (await params).handle.toLowerCase();
  if (!HANDLE_PATTERN.test(handle)) notFound();

  // Already a member? Go straight to the person's profile, where the friend button is.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect(`/u/${handle}`);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <RememberInvite handle={handle} />
      <p className="text-sm font-semibold opacity-70">TunedIn</p>
      <h1 className="max-w-sm text-3xl font-bold">@{handle} wants to see what you are listening to</h1>
      <p className="max-w-sm opacity-80">
        TunedIn shows what your friends at NYU are playing right now, and what the whole campus has on
        repeat. It is free and takes a minute to join.
      </p>
      <Link href="/login" className="btn mt-2 px-6">
        Join with your NYU email
      </Link>
      <p className="max-w-sm text-xs opacity-60">
        After you sign up, we send @{handle} a friend request from you. They choose whether to accept.
      </p>
      <Link href="/nyu" className="text-sm underline opacity-70">
        See what NYU is listening to
      </Link>
    </main>
  );
}
