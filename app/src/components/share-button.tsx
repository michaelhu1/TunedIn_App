"use client";

import { useState } from "react";

// Shares a link. On phones this opens the normal share sheet (Messages, Instagram, ...);
// elsewhere it copies the link.
export default function ShareButton({ path, title, label = "Share" }: { path: string; title: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    if (navigator.share) {
      // Closing the share sheet without sharing throws; that is not an error worth showing.
      await navigator.share({ title, url }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" onClick={share} className="whitespace-nowrap rounded-full border border-foreground/20 px-4 py-1.5 text-sm font-semibold">
      {copied ? "Link copied" : label}
    </button>
  );
}
