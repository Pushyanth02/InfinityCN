/**
 * Lemniscate — Next.js Instrumentation
 * ----------------------------------------------------------------------------
 * Runs once when the Next.js server starts (both dev and production).
 * Used for environment validation and startup checks.
 *
 * Runtime behavior:
 *   • Vercel (serverless): env validation runs, but the embedded job poller
 *     and backup scheduler are SKIPPED — serverless functions freeze between
 *     invocations, so setInterval-based pollers never fire and file-backed
 *     backups are impossible (read-only FS). Processing happens in-request
 *     via dispatch.ts + Next.js after().
 *   • Self-hosted (Docker / local dev): poller + backup scheduler run.
 *
 * Spec references: 2.1 (production auth requirement), 2.21 (env validation)
 */

import { isVercel } from '@/lib/runtime'

export async function register() {
  // Only run on the server side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { enforceEnvironment } = await import('@/lib/env-validation')
    enforceEnvironment()

    // Register pluggable providers (deterministic defaults).
    // Future cloud/AI providers are registered in @/lib/providers without
    // touching services or API code.
    await import('@/lib/providers')

    // Vercel: skip the background poller and backup scheduler.
    //   • The poller uses setInterval, which never fires on serverless (the
    //     function freezes between invocations). Jobs are processed in-request
    //     via dispatch.ts (Next.js after()).
    //   • The backup scheduler copies a SQLite file — impossible on Vercel
    //     (read-only FS + Turso is a remote DB with no local file to copy).
    if (isVercel()) {
      return
    }

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
