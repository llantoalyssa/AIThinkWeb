import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  // Default stays .next. Lets a build-verification run use its own dist dir
  // while `next dev` is holding a lock on .next (Windows EPERM).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // pdfjs-dist must run outside webpack bundling (Node runtime only)
  serverExternalPackages: ["pdfjs-dist"],

  experimental: {
    // Client-side router cache: a page you already visited is reused for this
    // long when you navigate BACK to it, instead of being re-rendered on the
    // server. Dashboards are force-dynamic, so the default for dynamic routes is
    // 0s — every sidebar click re-fetched everything, which is a large part of
    // why moving between department tabs felt slow.
    //
    // 30s is the honest trade: revisiting a tab within half a minute may show
    // data up to 30s old. A hard refresh always re-fetches, and every mutating
    // action refreshes its own data in place. Lower it for fresher data, raise
    // it for a snappier feel.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
