import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { appleMusicCredentials, createDeveloperToken, MAX_TOKEN_SECONDS, parseApplePrivateKey } from "./apple-music-token";

// A throwaway key of the same kind Apple issues (P-256, PKCS#8 PEM, which is what a .p8 is).
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const CREDS = { teamId: "TEAM123456", keyId: "KEY1234567", privateKey: PEM };
const NOW = new Date("2026-11-24T12:00:00Z");

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());

describe("createDeveloperToken", () => {
  it("builds the header and claims Apple asks for", () => {
    const [header, payload] = createDeveloperToken(CREDS, 3600, NOW).split(".");
    expect(decode(header)).toEqual({ alg: "ES256", kid: "KEY1234567", typ: "JWT" });
    const iat = NOW.getTime() / 1000;
    expect(decode(payload)).toEqual({ iss: "TEAM123456", iat, exp: iat + 3600 });
  });

  it("signs with ES256 in the raw form JWTs use", () => {
    const [header, payload, signature] = createDeveloperToken(CREDS, 3600, NOW).split(".");
    const sig = Buffer.from(signature, "base64url");
    expect(sig).toHaveLength(64);
    const ok = verify("sha256", Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, sig);
    expect(ok).toBe(true);
  });

  it("never exceeds Apple's six-month limit", () => {
    const [, payload] = createDeveloperToken(CREDS, 10 * MAX_TOKEN_SECONDS, NOW).split(".");
    const { iat, exp } = decode(payload);
    expect(exp - iat).toBe(MAX_TOKEN_SECONDS);
  });

  it("throws on a key that is not a key", () => {
    expect(() => createDeveloperToken({ ...CREDS, privateKey: "not a key" }, 3600, NOW)).toThrow();
  });
});

describe("parseApplePrivateKey", () => {
  const same = (raw: string) =>
    expect(parseApplePrivateKey(raw).export({ type: "pkcs8", format: "pem" })).toBe(PEM);

  it("reads the file as downloaded", () => same(PEM));
  it("reads it pasted on one line with \\n for line breaks", () => same(PEM.trim().replace(/\n/g, "\\n")));
  it("reads only the middle part, without the BEGIN and END lines", () =>
    same(PEM.split("\n").filter((l) => l && !l.startsWith("-----")).join("")));
});

describe("appleMusicCredentials", () => {
  const full = { APPLE_MUSIC_TEAM_ID: " TEAM123456 ", APPLE_MUSIC_KEY_ID: "KEY1234567", APPLE_MUSIC_PRIVATE_KEY: PEM };

  it("returns the trimmed values when all three are set", () => {
    expect(appleMusicCredentials(full as unknown as NodeJS.ProcessEnv)).toEqual({ teamId: "TEAM123456", keyId: "KEY1234567", privateKey: PEM.trim() });
  });
  it("is off if any one is missing", () => {
    for (const k of Object.keys(full)) {
      expect(appleMusicCredentials({ ...full, [k]: "" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    }
  });
});
