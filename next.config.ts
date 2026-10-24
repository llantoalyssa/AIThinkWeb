import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  // pdfjs-dist must run outside webpack bundling (Node runtime only)
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
