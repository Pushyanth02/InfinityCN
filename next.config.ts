import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

// Pin the workspace root to this project directory. Without this, Next.js can
// infer the wrong root when a stray lockfile exists in a parent directory
// (e.g. the user's home folder), which nests the `standalone` output under an
// unexpected path and breaks `node .next/standalone/server.js`.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin BOTH the Turbopack root and the Node-File-Tracing root to this project.
  // Without the NFT root pin, a stray lockfile in a parent directory (e.g. the
  // user's home folder) makes Next infer a higher workspace root and trace far
  // more than needed — the source of the "Encountered unexpected file in NFT
  // list / whole project traced" warning. Build-only; no runtime effect.
  outputFileTracingRoot: projectRoot,
  turbopack: { root: projectRoot },
  serverExternalPackages: ["mammoth"],
  reactStrictMode: true,
  // Tree-shake barrel exports at build time — reduces bundle size for
  // lucide-react (~6,000 icons), framer-motion, and radix primitives.
  // Only the actually-imported icons/components end up in client chunks.
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-tooltip",
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      {
        // Prevent caching of API responses by intermediary proxies.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
    ];
  },
};

export default nextConfig;
