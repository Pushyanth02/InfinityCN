const config = {
  // Empty in Vite/vitest to avoid resolution errors;
  // Next.js/Turbopack loads PostCSS plugins from this config directly.
  plugins: process.env.VITEST ? [] : ["@tailwindcss/postcss"],
};

export default config;
