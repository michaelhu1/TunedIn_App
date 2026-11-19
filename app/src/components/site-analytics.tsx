"use client";

import { Analytics } from "@vercel/analytics/next";

// Page-view counting with Vercel Web Analytics: no cookies, and visitors are not identified
// or followed across sites. It only reports on the deployed site (nothing is sent in local
// development).
//
// Some addresses contain a person's handle (/u/maya, /invite/maya). Those are replaced with
// a placeholder before anything is sent, so the analytics can say "a profile was viewed"
// but never whose.
export default function SiteAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => ({
        ...event,
        url: event.url.replace(/\/(u|invite)\/[^/?#]+/, "/$1/[handle]"),
      })}
    />
  );
}
