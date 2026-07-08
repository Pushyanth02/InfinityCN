/**
 * Lemniscate — Next.js Instrumentation
 * ----------------------------------------------------------------------------
 * Runs once when the Next.js server starts (both dev and production).
 * Used for environment validation and startup checks.
 *
 * Spec references: 2.1 (production auth requirement), 2.21 (env validation)
 */

export async function register() {
  // Only run on the server side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { enforceEnvironment } = await import('@/lib/env-validation')
    enforceEnvironment()

    const { startBackupScheduler } = await import('@/lib/backup')
    startBackupScheduler()

    // Start the in-process job poller so uploads are processed even when no
    // standalone worker container is running (single-process deployments and
    // local `next dev`). Deployments that run the dedicated worker service
    // (see docker-compose.yml) set DISABLE_EMBEDDED_WORKER=1 to avoid two
    // pollers competing for the same jobs.
    //
    // The poller itself is idempotent (guarded by an internal `started` flag),
    // and job claiming is atomic (CAS via Prisma updateMany), so even if both
    // pollers ran they would not double-process a job — this env flag simply
    // avoids redundant polling work.
    if (process.env.DISABLE_EMBEDDED_WORKER !== '1') {
      const { startEmbeddedPoller } = await import('@/lib/pipeline/embedded-poller')
      startEmbeddedPoller()
    }
  }
}
