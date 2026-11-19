"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/avatar";
import { createClient } from "@/lib/supabase/client";
import { AVATAR_SIZE, MAX_INPUT_BYTES, avatarPathFromPublicUrl, cropForFraming, type Framing, type SquareCrop } from "@/lib/image";
import PhotoFramer from "./photo-framer";

// Profile photo picker. It saves on its own (separately from the rest of the editor's
// form) because a photo is a file upload, not a text field.
//
// After picking, the person positions the photo ("move and zoom", see photo-framer.tsx),
// then it is shrunk to a 256x256 JPEG on the device before it is sent. Two reasons:
//   1. Size: a phone photo is several MB; the result is a few tens of KB, well under the
//      bucket's 512 KB limit, and quick to load for everyone who views the profile.
//   2. Privacy (deliberate): redrawing the pixels onto a canvas and exporting a fresh
//      JPEG drops the EXIF metadata phones embed in photos, which can include the GPS
//      location where it was taken and the phone model. Only the pixels survive.

type Status = { kind: "idle" } | { kind: "working"; label: string } | { kind: "error"; message: string };

/** GIFs are uploaded untouched, so they have to fit the storage bucket's own limit. */
const MAX_GIF_BYTES = 2 * 1024 * 1024;

const UNSUPPORTED = "That photo format is not supported here. Try a JPEG or PNG.";

// While positioning, we work from a copy no bigger than this on its long side. A 48-megapixel
// phone photo takes hundreds of megabytes of memory once opened; the copy takes a few, is
// still several times sharper than the 256px result, and keeps dragging smooth.
const WORKING_MAX = 1280;

/** A photo that has been picked and is waiting to be positioned. */
type Pending = { canvas: HTMLCanvasElement; previewUrl: string; width: number; height: number };

export default function AvatarUpload({
  userId,
  handle,
  currentUrl,
}: {
  userId: string;
  handle: string;
  currentUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  // Kept locally so the new photo shows straight away, before the page refresh lands.
  const [url, setUrl] = useState(currentUrl);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [pending, setPending] = useState<Pending | null>(null);
  const working = status.kind === "working";

  async function onPick(file: File) {
    if (file.size > MAX_INPUT_BYTES) {
      setStatus({ kind: "error", message: "That file is too large to open here. Pick a different photo." });
      return;
    }
    // Animated GIFs are kept exactly as they are. Redrawing one on a canvas (which is how
    // photos are cropped and shrunk) would keep only its first frame. So a GIF skips the
    // move-and-zoom step, is shown centred in the circle, and must already be small.
    if (file.type === "image/gif") {
      if (file.size > MAX_GIF_BYTES) {
        setStatus({ kind: "error", message: "That GIF is too large. Pick one under 2 MB." });
        return;
      }
      setStatus({ kind: "working", label: "Uploading..." });
      await upload(file, "gif", "image/gif");
      return;
    }

    setStatus({ kind: "working", label: "Opening photo..." });
    try {
      setPending(await toWorkingCopy(file));
      setStatus({ kind: "idle" });
    } catch {
      // Most often a HEIC photo in a browser that cannot decode HEIC (anything but Safari).
      setStatus({ kind: "error", message: UNSUPPORTED });
    }
  }

  function closeFramer() {
    if (pending) URL.revokeObjectURL(pending.previewUrl);
    setPending(null);
  }

  // The person has positioned the photo: cut out what is in the window and upload it.
  async function onConfirm(framing: Framing, view: number) {
    if (!pending) return;
    setStatus({ kind: "working", label: "Uploading..." });

    let blob: Blob;
    try {
      blob = await exportSquareJpeg(pending.canvas, cropForFraming(framing, pending.width, pending.height, view));
    } catch {
      setStatus({ kind: "error", message: "Could not prepare the photo. Try again." });
      return;
    }

    await upload(blob, "jpg", "image/jpeg");
  }

  // Store the file, point the profile at it, and tidy up the previous one.
  async function upload(blob: Blob, extension: "jpg" | "gif", contentType: string) {
    const supabase = createClient();
    const bucket = supabase.storage.from("avatars");
    // A new name every time: the file is cached for a year (cacheControl below), so
    // reusing a name would keep showing the old photo to anyone who had seen it.
    const path = `${userId}/${Date.now()}.${extension}`;
    const { error: uploadError } = await bucket.upload(path, blob, {
      contentType,
      cacheControl: "31536000",
    });
    if (uploadError) {
      setStatus({ kind: "error", message: "Could not upload the photo. Try again." });
      return;
    }

    const newUrl = bucket.getPublicUrl(path).data.publicUrl;
    const { error: saveError } = await supabase.from("profiles").update({ avatar_url: newUrl }).eq("id", userId);
    if (saveError) {
      // The file is up but the profile does not point at it: remove it so it is not left
      // orphaned in storage.
      await bucket.remove([path]).catch(() => {});
      setStatus({ kind: "error", message: "Could not save the photo. Try again." });
      return;
    }

    await removeOldFile(url);
    setUrl(newUrl);
    closeFramer();
    setStatus({ kind: "idle" });
    router.refresh();
  }

  async function onRemove() {
    setStatus({ kind: "working", label: "Removing..." });
    const { error } = await createClient().from("profiles").update({ avatar_url: null }).eq("id", userId);
    if (error) {
      setStatus({ kind: "error", message: "Could not remove the photo. Try again." });
      return;
    }
    await removeOldFile(url);
    setUrl(null);
    setStatus({ kind: "idle" });
    router.refresh();
  }

  // Best effort: the profile no longer points at the old file, so failing to delete it
  // only wastes a little storage. Only files in this user's own folder are tried (the
  // storage rules would refuse anything else anyway), which also skips photos that came
  // from somewhere else, like a sign-in provider.
  async function removeOldFile(oldUrl: string | null) {
    const oldPath = avatarPathFromPublicUrl(oldUrl);
    if (!oldPath || !oldPath.startsWith(`${userId}/`)) return;
    try {
      await createClient().storage.from("avatars").remove([oldPath]);
    } catch {
      // ignored, see above
    }
  }

  if (pending) {
    return (
      <div className="flex flex-col gap-2">
        <PhotoFramer
          source={pending.previewUrl}
          width={pending.width}
          height={pending.height}
          busy={working}
          onCancel={() => {
            closeFramer();
            setStatus({ kind: "idle" });
          }}
          onConfirm={onConfirm}
        />
        {status.kind === "error" && (
          <p role="alert" className="text-center text-sm text-danger">
            {status.message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar handle={handle} src={url} size={96} />
      <div className="flex flex-col items-start gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn px-4"
            disabled={working}
            onClick={() => inputRef.current?.click()}
          >
            {working ? status.label : "Change photo"}
          </button>
          {url && (
            <button
              type="button"
              className="rounded-lg border border-foreground/20 px-4 py-3 font-semibold transition hover:border-foreground/60 disabled:opacity-50"
              disabled={working}
              onClick={onRemove}
            >
              Remove photo
            </button>
          )}
        </div>
        {/* Hidden: the real button above opens it, so keyboard and screen reader users get
            a normal button. On phones this opens the photo library or the camera. HEIC is
            listed so iPhones offer their photos; Safari can decode them, others may not. */}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/gif"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Clear it so picking the same file again still fires a change.
            e.target.value = "";
            if (file) onPick(file);
          }}
        />
        <p aria-live="polite" className="sr-only">
          {working ? status.label : ""}
        </p>
        {status.kind === "error" && (
          <p role="alert" className="text-sm text-danger">
            {status.message}
          </p>
        )}
      </div>
    </div>
  );
}

// Open the picked file and draw it onto a modest-sized canvas (see WORKING_MAX). The full
// size original is released straight away. Throws if the browser cannot decode the file.
async function toWorkingCopy(file: File): Promise<Pending> {
  const source = await decode(file);
  try {
    const shrink = Math.min(1, WORKING_MAX / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * shrink));
    const height = Math.max(1, Math.round(source.height * shrink));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No canvas");
    // JPEG has no transparency; without this a transparent PNG would turn black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source.image, 0, 0, width, height);
    const preview = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Preview failed"))), "image/jpeg", 0.8),
    );
    return { canvas, previewUrl: URL.createObjectURL(preview), width, height };
  } finally {
    source.release();
  }
}

// Cut the chosen square out of the working copy, scale it to AVATAR_SIZE and export a JPEG.
// Exporting fresh pixels is also what drops the photo's hidden metadata.
async function exportSquareJpeg(working: HTMLCanvasElement, crop: SquareCrop): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(working, crop.sx, crop.sy, crop.size, crop.size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), "image/jpeg", 0.85),
  );
}

type Decoded = { image: CanvasImageSource; width: number; height: number; release: () => void };

// Phones often store a photo sideways plus an EXIF "rotate me" flag. We must apply that
// flag ourselves, because the metadata carrying it is dropped on export.
async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Older Safari rejects the options argument; fall through to an <img>.
    }
  }
  // Current browsers apply EXIF orientation to <img> by default, and drawImage uses it.
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = objectUrl;
    await img.decode();
    return {
      image: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (e) {
    URL.revokeObjectURL(objectUrl);
    throw e;
  }
}
