/**
 * Lemniscate — Analytics Service
 * ----------------------------------------------------------------------------
 * Dashboard aggregates and statistics.
 */

import { db } from '@/lib/db'

// ─── Types ────────────────────────────────────────────────────────────────

export interface DashboardStats {
  counts: {
    documents: number
    jobs: number
    narratives: number
    scenes: number
    characters: number
    events: number
    peaks: number
  }
  byStatus: Array<{ status: string; _count: number }>
  byJobStatus: Array<{ status: string; _count: number }>
  byMode: Array<{ mode: string; _count: number }>
  recentJobs: Array<{
    id: string
    status: string
    mode: string
    progress: number
    stage: string | null
    durationMs: number | null
    document: { id: string; originalName: string }
  }>
}

// ─── Service methods ──────────────────────────────────────────────────────

/**
 * Get dashboard statistics: entity counts, status distributions, recent jobs.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const [
    documents,
    jobs,
    narratives,
    scenes,
    characters,
    events,
    peaks,
    byStatus,
    byJobStatus,
    byMode,
    recentJobs,
  ] = await Promise.all([
    db.document.count(),
    db.job.count(),
    db.narrative.count(),
    db.scene.count(),
    db.character.count(),
    db.event.count(),
    db.emotionalPeak.count(),
    db.document.groupBy({ by: ['status'], _count: true }),
    db.job.groupBy({ by: ['status'], _count: true }),
    db.narrative.groupBy({ by: ['mode'], _count: true }),
    db.job.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { document: { select: { id: true, originalName: true } } },
    }),
  ])

  return {
    counts: { documents, jobs, narratives, scenes, characters, events, peaks },
    byStatus: byStatus.map((s) => ({ status: s.status, _count: s._count })),
    byJobStatus: byJobStatus.map((s) => ({ status: s.status, _count: s._count })),
    byMode: byMode.map((m) => ({ mode: m.mode, _count: m._count })),
    recentJobs: recentJobs.map((j) => ({
      id: j.id,
      status: j.status,
      mode: j.mode,
      progress: j.progress,
      stage: j.stage,
      durationMs: j.durationMs,
      document: j.document,
    })),
  }
}
