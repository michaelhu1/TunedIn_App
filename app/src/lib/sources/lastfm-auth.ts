// "Connect Last.fm" without typing a username.
//
// Last.fm's web sign-in works like this:
//   1. We send the person to last.fm with our public API key and a return address.
//   2. They sign in there (we never see their password) and approve.
//   3. Last.fm sends them back to us with a one-time token.
//   4. We swap the token for their username, proving the request is ours by signing it
//      with our shared secret.
// We only want step 4's username. The session key Last.fm also returns would let an app
// act as the person on Last.fm; TunedIn has no use for that, so it is thrown away.
//
// No "server-only" import here so the signing function can be unit tested; the secret is
// only ever read by the route handlers that call these.

import { createHash } from "node:crypto";

const API_URL = "https://ws.audioscrobbler.com/2.0/";

/** True when the shared secret is configured, which is what makes the button available. */
export function lastfmWebAuthEnabled(): boolean {
  return Boolean(process.env.LASTFM_API_KEY && process.env.LASTFM_SHARED_SECRET);
}

/** Where to send the person to sign in on Last.fm. `callbackUrl` is where they come back to. */
export function lastfmAuthUrl(apiKey: string, callbackUrl: string): string {
  return `https://www.last.fm/api/auth/?${new URLSearchParams({ api_key: apiKey, cb: callbackUrl })}`;
}

/**
 * Last.fm's request signature: every parameter as name+value, sorted by name, joined
 * together, with the shared secret on the end, then MD5 of the lot.
 * (https://www.last.fm/api/webauth, section 6.) `format` is not part of the signature.
 */
export function lastfmSignature(params: Record<string, string>, secret: string): string {
  const base = Object.keys(params)
    .filter((k) => k !== "format" && k !== "callback")
    .sort()
    .map((k) => k + params[k])
    .join("");
  return createHash("md5").update(base + secret, "utf8").digest("hex");
}

/** Swap the one-time token for the person's Last.fm username. Null if Last.fm refuses it. */
export async function lastfmUsernameForToken(token: string): Promise<string | null> {
  const apiKey = process.env.LASTFM_API_KEY;
  const secret = process.env.LASTFM_SHARED_SECRET;
  if (!apiKey || !secret) return null;

  const params: Record<string, string> = { method: "auth.getSession", api_key: apiKey, token };
  const query = new URLSearchParams({ ...params, api_sig: lastfmSignature(params, secret), format: "json" });
  try {
    const res = await fetch(`${API_URL}?${query}`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    const body = (await res.json()) as { session?: { name?: string } };
    const name = body.session?.name;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
}
