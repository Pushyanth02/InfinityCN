/**
 * Lemniscate — SQLite Queue Provider
 * ----------------------------------------------------------------------------
 * Implements the `IQueueProvider` interface using the existing SQLite-backed
 * `Job` table with atomic CAS claiming. Delegates to the shared `job-runner.ts`
 * logic which is already battle-tested by both the embedded poller and the
 * standalone worker.
 */

import { db } from '@/lib/db'
import type { IQueueProvider, QueueJob } from '../types'
import { claimNextJob, rehydrateStalledJobs } from '@/lib/pipeline/job-runner'
import { createLogger } from '@/lib/logger'

const logger = createLogger('sqlite-queue')

export class SqliteQueueProvider implements IQueueProvider {
  readonly name = 'sqlite'

  async claimNext(): Promise<QueueJob | null> {
    const claim = await claimNextJob()
    if (!claim) return null
    return {
      jobId: claim.jobId,
      documentId: claim.documentId,
      mode: claim.mode,
    }
  }

  async rehydrateStalled(staleThresholdMs?: number): Promise<number> {
    return rehydrateStalledJobs(staleThresholdMs)
  }

  async deadLetter(jobId: string, error: string): Promise<void> {
    await db.job.update({
      where: { id: jobId },
      data: {
        status: 'DEAD_LETTER',
        stage: 'FAILED',
        error,
        completedAt: new Date(),
      },
    }).catch((err: unknown) => {
      logger.error('Failed to move job to dead-letter', { jobId, error: (err as Error).message })
    })
  }

  async retryDeadLetter(jobId: string): Promise<boolean> {
    const result = await db.job.updateMany({
      where: { id: jobId, status: 'DEAD_LETTER' },
      data: {
        status: 'QUEUED',
        stage: 'QUEUED',
        progress: 0,
        error: null,
        startedAt: null,
        completedAt: null,
      },
    })
    return result.count > 0
  }
}
