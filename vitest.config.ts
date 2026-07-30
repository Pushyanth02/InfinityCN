import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Engine modules import "server-only", which throws outside a React
      // Server Component. Stub it out so pure functions can be unit-tested.
      "server-only": path.resolve(dir, "tests/stubs/server-only.ts"),
      "@/": `${path.resolve(dir, "src")}/`,
    },
  },
});
