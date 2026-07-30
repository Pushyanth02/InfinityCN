import { z } from "zod";

/**
 * Environment variable validation.
 *
 * Validates required environment variables at startup. If any are missing
 * or invalid, the app fails fast with a clear error message instead of
 * crashing later at runtime.
 */

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Get validated environment variables. Throws on first call if invalid.
 * Subsequent calls return the cached result.
 */
export function getEnv(): Env {
  if (cached) return cached;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Environment validation failed:\n${issues}`);
  }
  cached = result.data;
  return cached;
}

/**
 * Check if env is valid without throwing. Returns { ok, error }.
 * Safe to call in any context.
 */
export function checkEnv(): { ok: boolean; error?: string } {
  try {
    getEnv();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown env error" };
  }
}
