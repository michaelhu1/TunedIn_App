// Pure helpers for profile photos. Nothing here touches the browser, so it can be unit
// tested in node; the canvas work that uses these lives in
// src/components/profile-editor/avatar-upload.tsx.

/** Side length, in pixels, of the square photo we store. Shown at up to ~96px, so 256
 *  stays sharp on high-density phone screens while keeping files around 20-40 KB. */
export const AVATAR_SIZE = 256;

/** Refuse picks larger than this before trying to decode them. Phone photos are usually
 *  2-8 MB; anything far bigger is probably not a photo, and decoding it could stall a
 *  low-end phone. */
export const MAX_INPUT_BYTES = 15 * 1024 * 1024;

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
