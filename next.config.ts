import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /* Production builds must surface type errors. */

  /* Static export for optimal client-side CDN performance on Vercel. */
  output: "export",

  /* Allow the preview environment's proxy origin to load dev resources. */
  allowedDevOrigins: ["*.space-z.ai", "*.chatglm.cn", "localhost", "127.0.0.1"],
};

export default nextConfig;
