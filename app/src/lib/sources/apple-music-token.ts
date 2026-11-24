// Apple Music "developer tokens".
//
// Every request to Apple Music must prove it comes from a member of the Apple Developer
// Program. The proof is a short signed note (a JWT) saying "team X, key Y, valid until Z",
// signed with the private key Apple issued for MusicKit. Nothing in it identifies a
// listener; that is the separate Music User Token (see apple-music.ts).
//
// The same kind of token is used in two places:
//   * by this server, to ask Apple for a person's recently played songs;
//   * by the "Connect Apple Music" button, which hands it to Apple's sign-in window.
// The native iOS app will not need this file: MusicKit on iOS makes its own.
//
// No "server-only" import here so the signing can be unit tested; the private key is only
// ever read by server code that calls these.

import { createPrivateKey, sign, type KeyObject } from "node:crypto";

export type AppleMusicCredentials = { teamId: string; keyId: string; privateKey: string };

/**
 * The three values from the Apple Developer site (docs/APPLE_MUSIC.md), or null if any is
 * missing, which switches the whole feature off.
 */
export function appleMusicCredentials(env: NodeJS.ProcessEnv = process.env): AppleMusicCredentials | null {
  const teamId = env.APPLE_MUSIC_TEAM_ID?.trim();
  const keyId = env.APPLE_MUSIC_KEY_ID?.trim();
  const privateKey = env.APPLE_MUSIC_PRIVATE_KEY?.trim();
  return teamId && keyId && privateKey ? { teamId, keyId, privateKey } : null;
}

export function appleMusicEnabled(): boolean {
  return appleMusicCredentials() !== null;
}

/**
 * Accepts the .p8 file however it was pasted into the hosting settings: as is, with its
 * line breaks turned into the two characters "\n", or as only the middle part without the
 * BEGIN/END lines.
 */
export function parseApplePrivateKey(raw: string): KeyObject {
  let pem = raw.trim().replace(/\\n/g, "\n");
  if (!pem.includes("BEGIN")) {
    const body = pem.replace(/\s+/g, "");
    pem = `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g)?.join("\n") ?? ""}\n-----END PRIVATE KEY-----`;
  }
  return createPrivateKey(pem);
}

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

/** Apple allows up to six months. Ours are short so a copied token soon stops working. */
export const MAX_TOKEN_SECONDS = 15_777_000;

/** Sign a developer token valid for `ttlSeconds` from `now`. Throws if the key is unusable. */
export function createDeveloperToken(creds: AppleMusicCredentials, ttlSeconds: number, now: Date = new Date()): string {
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + Math.min(Math.max(60, Math.floor(ttlSeconds)), MAX_TOKEN_SECONDS);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: creds.keyId, typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: creds.teamId, iat, exp }));
  const signingInput = `${header}.${payload}`;
  // ES256 = ECDSA on the P-256 curve with SHA-256. JWTs want the raw 64-byte signature
  // ("ieee-p1363"), not the DER wrapping Node produces by default.
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: parseApplePrivateKey(creds.privateKey),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${b64url(signature)}`;
}

const SERVER_TOKEN_SECONDS = 12 * 60 * 60;
let cached: { token: string; expiresAt: number; keyId: string } | null = null;

/** The token this server uses for its own calls to Apple. Reused until shortly before it expires. */
export function getServerDeveloperToken(): string | null {
  const creds = appleMusicCredentials();
  if (!creds) return null;
  if (cached && cached.keyId === creds.keyId && cached.expiresAt > Date.now() + 5 * 60_000) return cached.token;
  const token = createDeveloperToken(creds, SERVER_TOKEN_SECONDS);
  cached = { token, expiresAt: Date.now() + SERVER_TOKEN_SECONDS * 1000, keyId: creds.keyId };
  return token;
}
