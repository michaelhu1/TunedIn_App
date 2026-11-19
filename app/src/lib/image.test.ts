import { describe, expect, it } from "vitest";
import { avatarPathFromPublicUrl, centeredSquareCrop } from "./image";

describe("centeredSquareCrop", () => {
  it("trims the sides of a landscape image equally", () => {
    expect(centeredSquareCrop(4000, 3000)).toEqual({ sx: 500, sy: 0, size: 3000 });
  });

  it("trims the top and bottom of a portrait image equally", () => {
    expect(centeredSquareCrop(3024, 4032)).toEqual({ sx: 0, sy: 504, size: 3024 });
  });

  it("leaves a square image alone", () => {
    expect(centeredSquareCrop(256, 256)).toEqual({ sx: 0, sy: 0, size: 256 });
  });

  it("rounds an odd difference down to whole pixels", () => {
    expect(centeredSquareCrop(101, 100)).toEqual({ sx: 0, sy: 0, size: 100 });
    expect(centeredSquareCrop(103, 100)).toEqual({ sx: 1, sy: 0, size: 100 });
  });

  it("handles a tiny image (it is scaled up later)", () => {
    expect(centeredSquareCrop(1, 1)).toEqual({ sx: 0, sy: 0, size: 1 });
  });

  it("rejects images with no size", () => {
    expect(() => centeredSquareCrop(0, 100)).toThrow();
    expect(() => centeredSquareCrop(100, -1)).toThrow();
    expect(() => centeredSquareCrop(NaN, 100)).toThrow();
  });
});

describe("avatarPathFromPublicUrl", () => {
  const uid = "00000000-0000-0000-0000-00000000000a";

  it("extracts the path from a local URL", () => {
    expect(avatarPathFromPublicUrl(`http://127.0.0.1:54321/storage/v1/object/public/avatars/${uid}/1700000000000.jpg`)).toBe(
      `${uid}/1700000000000.jpg`,
    );
  });

  it("extracts the path from a hosted URL and ignores a query string", () => {
    expect(avatarPathFromPublicUrl(`https://abc.supabase.co/storage/v1/object/public/avatars/${uid}/1.jpg?t=2`)).toBe(
      `${uid}/1.jpg`,
    );
  });

  it("decodes percent-encoding", () => {
    expect(avatarPathFromPublicUrl(`https://x.supabase.co/storage/v1/object/public/avatars/${uid}/my%20photo.jpg`)).toBe(
      `${uid}/my photo.jpg`,
    );
  });

  it("returns null for anything that is not one of our avatars", () => {
    expect(avatarPathFromPublicUrl(null)).toBeNull();
    expect(avatarPathFromPublicUrl("")).toBeNull();
    expect(avatarPathFromPublicUrl("not a url")).toBeNull();
    expect(avatarPathFromPublicUrl("https://lh3.googleusercontent.com/a/abc")).toBeNull();
    expect(avatarPathFromPublicUrl("https://x.supabase.co/storage/v1/object/public/other/a.jpg")).toBeNull();
    expect(avatarPathFromPublicUrl("https://x.supabase.co/storage/v1/object/public/avatars/")).toBeNull();
    // The marker must start the path, not appear somewhere inside it.
    expect(avatarPathFromPublicUrl("https://evil.example/x/storage/v1/object/public/avatars/a.jpg")).toBeNull();
  });
});
