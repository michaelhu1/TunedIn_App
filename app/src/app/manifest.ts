import type { MetadataRoute } from "next";

// The web app manifest: what makes "Add to Home Screen" install TunedIn like an app,
// with its own icon and no browser bars.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TunedIn",
    short_name: "TunedIn",
    description: "See what your friends nearby are listening to right now, and what NYU has on repeat.",
    start_url: "/home",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#6d28d9",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
