/**
 * Lemniscate — Runtime Detection
 * ----------------------------------------------------------------------------
 * Server-only helpers that detect the deployment runtime so database, storage,
 * and processing layers can branch without scattering env checks across the
 * codebase.
 *
 * Two runtimes are supported:
 *   • Self-hosted (Docker / local dev): file-backed SQLite, `/app` or
 *     `public/uploads` storage, a long-lived process that runs the embedded
 *     job poller + backup scheduler.
 *   • Vercel (serverless): Turso (libSQL) database, `/tmp` storage (the only
 *     writable directory, scoped to a single invocation), and in-request
 *     processing via Next.js `after()` (no `setInterval` poller — serverless
 *     functions are frozen between invocations).
 */

/** True when running on Vercel (serverless). */
export function isVercel(): boolean {
  return process.env.VERCEL === '1'
}

/**
 * True when the database is backed by Turso / libSQL rather than a local
 * SQLite file. Driven by the presence of `LIBSQL_URL`.
 */
export function usesLibSQL(): boolean {
  return Boolean(process.env.LIBSQL_URL)
}

/**
 * The writable directory for uploaded files.
 *
 * On Vercel the filesystem is read-only except for `/tmp`, which is scoped to
 * a single serverless invocation (files do not survive across requests). This
 * is acceptable because the pipeline reads the file synchronously during the
 * same `after()` callback that processes the job.
 *
 * On self-hosted deployments the configured `UPLOAD_DIR` (or the project's
 * `public/uploads`) is used so files persist and can be served in dev.
 */
export function runtimeUploadDir(): string {
  if (isVercel()) return '/tmp/lemniscate-uploads'
  if (process.env.UPLOAD_DIR) return process.env.UPLOAD_DIR.trim()
  return ''
}

/**
 * Whether in-request processing should be used instead of a background poller.
 *
 * On Vercel there is no long-lived process to run `setInterval`, so jobs are
 * processed synchronously inside the route handler's `after()` callback (which
 * runs within the function's `maxDuration`). On self-hosted deployments the
 * embedded poller or standalone worker handles this — in-request dispatch is a
 * no-op to avoid double-processing.
 */
export function useInRequestProcessing(): boolean {
  return isVercel()
}
