import { describe, expect, it } from "vitest";
import { lastfmAuthUrl, lastfmSignature } from "./lastfm-auth";

describe("lastfmSignature", () => {
  it("is the MD5 of sorted name+value pairs followed by the secret", () => {
    // md5 of "api_keyKEYmethodauth.getSessiontokenTOKEN" + "SECRET", computed separately with Python.
    expect(lastfmSignature({ token: "TOKEN", method: "auth.getSession", api_key: "KEY" }, "SECRET")).toBe(
      "5479efdba54a79385144dca24a423b8a",
    );
  });

  it("does not depend on the order the parameters were given in", () => {
    const a = lastfmSignature({ a: "1", b: "2", c: "3" }, "s");
    const b = lastfmSignature({ c: "3", a: "1", b: "2" }, "s");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });

  it("leaves `format` out, as Last.fm requires", () => {
    expect(lastfmSignature({ a: "1", format: "json" }, "s")).toBe(lastfmSignature({ a: "1" }, "s"));
  });

  it("changes when the secret changes", () => {
    expect(lastfmSignature({ a: "1" }, "s1")).not.toBe(lastfmSignature({ a: "1" }, "s2"));
  });
});

describe("lastfmAuthUrl", () => {
  it("carries the key and an encoded return address", () => {
    const url = new URL(lastfmAuthUrl("KEY", "https://example.test/api/lastfm/callback/abc"));
    expect(url.origin + url.pathname).toBe("https://www.last.fm/api/auth/");
    expect(url.searchParams.get("api_key")).toBe("KEY");
    expect(url.searchParams.get("cb")).toBe("https://example.test/api/lastfm/callback/abc");
  });
});
