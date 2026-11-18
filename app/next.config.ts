import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a second dev server run side by side (for example one against the local database
  // and one against the hosted project) without the two fighting over the same build folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
