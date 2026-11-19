import { describe, expect, it } from "vitest";
import { avatarPathFromPublicUrl, centeredSquareCrop, MAX_ZOOM, clampFraming, cropForFraming, initialFraming, zoomAroundCentre } from "./image";

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

describe("framing a photo (drag and zoom)", () => {
  const W = 1200, H = 800, VIEW = 300; // landscape: at zoom 1 it is 450x300 on screen

  it("starts centred and filling the window", () => {
    const f = initialFraming(W, H, VIEW);
    expect(f).toEqual({ zoom: 1, x: -75, y: 0 });
    // Same result as the old automatic centre crop.
    expect(cropForFraming(f, W, H, VIEW)).toEqual({ sx: 200, sy: 0, size: 800 });
  });

  it("never lets an edge of the photo come inside the window", () => {
    expect(clampFraming({ zoom: 1, x: 50, y: 40 }, W, H, VIEW)).toEqual({ zoom: 1, x: 0, y: 0 });
    expect(clampFraming({ zoom: 1, x: -999, y: -999 }, W, H, VIEW)).toEqual({ zoom: 1, x: -150, y: 0 });
  });

  it("keeps zoom between 1 and the maximum", () => {
    expect(clampFraming({ zoom: 0.2, x: 0, y: 0 }, W, H, VIEW).zoom).toBe(1);
    expect(clampFraming({ zoom: 99, x: 0, y: 0 }, W, H, VIEW).zoom).toBe(MAX_ZOOM);
  });

  it("zooms around the middle of the window", () => {
    const f = zoomAroundCentre(initialFraming(W, H, VIEW), 2, W, H, VIEW);
    const crop = cropForFraming(f, W, H, VIEW);
    expect(crop.size).toBe(400); // half of 800: twice as close
    // Still centred on the middle of the photo (600, 400).
    expect(crop.sx + crop.size / 2).toBeCloseTo(600);
    expect(crop.sy + crop.size / 2).toBeCloseTo(400);
  });

  it("dragging left shows more of the right side", () => {
    const crop = cropForFraming({ zoom: 1, x: -150, y: 0 }, W, H, VIEW);
    expect(crop).toEqual({ sx: 400, sy: 0, size: 800 });
  });

  it("the saved square always lies inside the photo", () => {
    for (const f of [{ zoom: 3.3, x: -1234, y: -777 }, { zoom: 1.7, x: 12, y: -5000 }, { zoom: 4, x: -1, y: -1 }]) {
      const c = cropForFraming(f, W, H, VIEW);
      expect(c.sx).toBeGreaterThanOrEqual(0);
      expect(c.sy).toBeGreaterThanOrEqual(0);
      expect(c.sx + c.size).toBeLessThanOrEqual(W + 1e-6);
      expect(c.sy + c.size).toBeLessThanOrEqual(H + 1e-6);
    }
  });
});
