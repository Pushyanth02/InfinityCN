import type { MetadataRoute } from "next";

// PWA / web app manifest. Served at /manifest.webmanifest by Next.js.
// Uses the canonical Lemniscate icon (public/favicon.ico) so installed
// PWA surfaces (home-screen, task switcher) match the browser favicon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lemniscate — Document-to-Storytelling",
    short_name: "Lemniscate",
    description:
      "Transform PDF, DOCX, and TXT files into structured cinematic narratives through deterministic, offline, classical-NLP processing.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a12",
    theme_color: "#0a0a12",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
