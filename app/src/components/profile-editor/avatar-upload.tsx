"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/avatar";
import { createClient } from "@/lib/supabase/client";
import { AVATAR_SIZE, MAX_INPUT_BYTES, avatarPathFromPublicUrl, centeredSquareCrop } from "@/lib/image";

// Profile photo picker. It saves on its own (separately from the rest of the editor's
// form) because a photo is a file upload, not a text field.
//
// The photo is shrunk to a 256x256 JPEG on the device before it is sent. Two reasons:
//   1. Size: a phone photo is several MB; the result is a few tens of KB, well under the
//      bucket's 512 KB limit, and quick to load for everyone who views the profile.
//   2. Privacy (deliberate): redrawing the pixels onto a canvas and exporting a fresh
//      JPEG drops the EXIF metadata phones embed in photos, which can include the GPS
//      location where it was taken and the phone model. Only the pixels survive.

type Status = { kind: "idle" } | { kind: "working"; label: string } | { kind: "error"; message: string };

const UNSUPPORTED = "That photo format is not supported here. Try a JPEG or PNG.";

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
  const working = status.kind === "working";

  async function onPick(file: File) {
    if (file.size > MAX_INPUT_BYTES) {
      setStatus({ kind: "error", message: "That photo is too large. Pick one under 15 MB." });
      return;
    }
    setStatus({ kind: "working", label: "Uploading..." });

    let blob: Blob;
    try {
      blob = await toSquareJpeg(file);
    } catch {
      // Most often a HEIC photo in a browser that cannot decode HEIC (anything but Safari).
      setStatus({ kind: "error", message: UNSUPPORTED });
      return;
    }

    const supabase = createClient();
    const bucket = supabase.storage.from("avatars");
    // A new name every time: the file is cached for a year (cacheControl below), so
    // reusing a name would keep showing the old photo to anyone who had seen it.
    const path = `${userId}/${Date.now()}.jpg`;
    const { error: uploadError } = await bucket.upload(path, blob, {
      contentType: "image/jpeg",
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
          accept="image/jpeg,image/png,image/webp,image/heic"
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
          <p role="alert" className="text-sm text-red-500">
            {status.message}
          </p>
        )}
      </div>
    </div>
  );
}

// Decode the picked file, crop the centre square, scale it to AVATAR_SIZE and export a
// JPEG. Throws if the browser cannot decode the file.
async function toSquareJpeg(file: File): Promise<Blob> {
  const source = await decode(file);
  try {
    const { sx, sy, size } = centeredSquareCrop(source.width, source.height);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No canvas");
    // JPEG has no transparency; without this a transparent PNG would turn black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source.image, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), "image/jpeg", 0.85),
    );
  } finally {
    source.release();
  }
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
