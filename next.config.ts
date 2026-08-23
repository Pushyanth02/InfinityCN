import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /* Production builds must surface type errors. */

  /* Static export for optimal client-side CDN performance on Vercel. */
  output: "export",

  /* Allow local dev origins only — no third-party preview scaffolding. */
  allowedDevOrigins: ["localhost", "127.0.0.1"],
};

export default nextConfig;
