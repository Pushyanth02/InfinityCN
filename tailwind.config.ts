import type { Config } from "tailwindcss";

/**
 * Tailwind CSS configuration.
 *
 * Note: The primary design tokens (colors, fonts, shadows, animations) are
 * defined via `@theme` in `src/app/globals.css` (Tailwind v4 syntax). This
 * config exists only to register the content scanner and the animate plugin.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {},
  plugins: [],
};

export default config;
