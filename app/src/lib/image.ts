// Pure helpers for profile photos. Nothing here touches the browser, so it can be unit
// tested in node; the canvas work that uses these lives in
// src/components/profile-editor/avatar-upload.tsx.

/** Side length, in pixels, of the square photo we store. Shown at up to ~96px, so 256
 *  stays sharp on high-density phone screens while keeping files around 20-40 KB. */
export const AVATAR_SIZE = 256;

/** Refuse picks larger than this before trying to decode them. This is only a guard on the
 *  ORIGINAL file: whatever is picked is shrunk to a 256px JPEG of a few kilobytes before
 *  anything is uploaded. Ordinary phone photos are 2-8 MB, but full-resolution 48-megapixel
 *  and ProRAW shots from recent iPhones run to tens of megabytes, so the guard is generous.
 *  Beyond it the file is probably not a photo. */
export const MAX_INPUT_BYTES = 60 * 1024 * 1024;

/** The rectangle to copy out of the source image: the largest centred square. */
export type SquareCrop = { sx: number; sy: number; size: number };

/**
 * Given an image's width and height, return the largest square that fits, centred.
 * A 4000x3000 landscape photo gives { sx: 500, sy: 0, size: 3000 }: the left and right
 * 500px are trimmed equally. Values are whole pixels so the canvas does not blur edges.
 */
export function centeredSquareCrop(width: number, height: number): SquareCrop {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Image has no size");
  }
  const size = Math.floor(Math.min(width, height));
  return {
    sx: Math.floor((width - size) / 2),
    sy: Math.floor((height - size) / 2),
    size,
  };
}

// --- Repositioning a photo before saving (the "drag and zoom" step) -------------------
//
// The person sees their photo behind a square window of `view` pixels and can drag it and
// zoom in. The picture is described by three numbers: `zoom` (1 = the smallest size that
// still fills the window) and `x`, `y` (where the picture's top-left corner sits, in window
// pixels; 0 or negative, because the picture is at least as big as the window).

export const MAX_ZOOM = 4;

export type Framing = { zoom: number; x: number; y: number };

/** How many window pixels one image pixel takes up at a given zoom. */
export function displayScale(width: number, height: number, view: number, zoom: number): number {
  return (view / Math.min(width, height)) * zoom;
}

/** Keep the zoom in range and the picture covering the whole window (no empty edges). */
export function clampFraming(f: Framing, width: number, height: number, view: number): Framing {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, f.zoom));
  const scale = displayScale(width, height, view, zoom);
  const minX = view - width * scale; // furthest left the picture may go
  const minY = view - height * scale;
  return {
    zoom,
    x: Math.min(0, Math.max(minX, f.x)),
    y: Math.min(0, Math.max(minY, f.y)),
  };
}

/** The starting position: smallest size that fills the window, centred. */
export function initialFraming(width: number, height: number, view: number): Framing {
  const scale = displayScale(width, height, view, 1);
  return { zoom: 1, x: (view - width * scale) / 2, y: (view - height * scale) / 2 };
}

/** Change the zoom while keeping whatever is at the middle of the window in the middle. */
export function zoomAroundCentre(f: Framing, nextZoom: number, width: number, height: number, view: number): Framing {
  const before = displayScale(width, height, view, f.zoom);
  const zoom = Math.min(MAX_ZOOM, Math.max(1, nextZoom));
  const after = displayScale(width, height, view, zoom);
  // The image point currently under the window's centre...
  const cx = (view / 2 - f.x) / before;
  const cy = (view / 2 - f.y) / before;
  // ...should still be under the centre afterwards.
  return clampFraming({ zoom, x: view / 2 - cx * after, y: view / 2 - cy * after }, width, height, view);
}

/** Which square of the image is showing in the window: what gets saved. */
export function cropForFraming(f: Framing, width: number, height: number, view: number): SquareCrop {
  const c = clampFraming(f, width, height, view);
  const scale = displayScale(width, height, view, c.zoom);
  const size = Math.min(view / scale, width, height);
  return {
    sx: Math.min(Math.max(0, -c.x / scale), width - size),
    sy: Math.min(Math.max(0, -c.y / scale), height - size),
    size,
  };
}

const PUBLIC_AVATARS = "/storage/v1/object/public/avatars/";

/**
 * Turn a public photo URL back into its path inside the `avatars` bucket, which is what
 * the storage API wants when deleting. For
 *   http://127.0.0.1:54321/storage/v1/object/public/avatars/<user id>/1700000000.jpg
 * it returns "<user id>/1700000000.jpg". Returns null for anything that is not one of
 * our avatar URLs (for example an old photo from a sign-in provider), so callers never
 * try to delete something that is not ours.
 */
export function avatarPathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const i = parsed.pathname.indexOf(PUBLIC_AVATARS);
  // Must be at the very start of the path, the same rule as the database constraint.
  if (i !== 0) return null;
  const rest = parsed.pathname.slice(PUBLIC_AVATARS.length);
  if (!rest) return null;
  try {
    // The URL may percent-encode characters; the storage path is the decoded form.
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}
