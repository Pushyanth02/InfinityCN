/**
 * Lemniscate — Analytics Service
 * ----------------------------------------------------------------------------
 * Dashboard aggregates and statistics.
 */

import { db } from '@/lib/db'
import { getConfiguredProviderName } from '@/lib/providers/registry'
import { listIntelligenceEngines } from '@/lib/intelligence'
import { checkHealth } from '@/lib/services/job.service'

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

export interface SystemMetrics {
  timestamp: string
  health: {
    status: string
    database: string
    latencyMs?: number
  }
  entities: {
    documents: number
    jobs: number
    narratives: number
    scenes: number
    characters: number
    events: number
    peaks: number
    paragraphs: number
  }
  jobs: {
    byStatus: Array<{ status: string; count: number }>
  }
  processing: {
    avgDurationMs: number
    minDurationMs: number
    maxDurationMs: number
    p95DurationMs: number
    completedCount: number
  }
  providers: Record<string, string>
  intelligenceEngines: string[]
  version: string
  uptime: number | null
  memory: {
    rss: number
    heapUsed: number
    heapTotal: number
  } | null
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

/**
 * Get operational metrics for the versioned observability endpoint.
 */
export async function getSystemMetrics(): Promise<SystemMetrics> {
  const health = await checkHealth()

  const [
    documentCount,
    jobCount,
    narrativeCount,
    sceneCount,
    characterCount,
    eventCount,
    peakCount,
    paragraphCount,
    jobStatuses,
    completedJobs,
  ] = await Promise.all([
    db.document.count(),
    db.job.count(),
    db.narrative.count(),
    db.scene.count(),
    db.character.count(),
    db.event.count(),
    db.emotionalPeak.count(),
    db.paragraph.count(),
    db.job.groupBy({ by: ['status'], _count: true }),
    db.job.findMany({
      where: { status: 'COMPLETED', durationMs: { not: null } },
      select: { durationMs: true },
      take: 100,
      orderBy: { completedAt: 'desc' },
    }),
  ])

  const durations = completedJobs
    .map((job) => job.durationMs ?? 0)
    .filter((duration) => duration > 0)
  const sortedDurations = [...durations].sort((a, b) => a - b)

  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0
  const maxDuration = sortedDurations.at(-1) ?? 0
  const minDuration = sortedDurations[0] ?? 0
  const p95Duration = sortedDurations.length > 0
    ? sortedDurations[Math.min(sortedDurations.length - 1, Math.floor(sortedDurations.length * 0.95))] ?? 0
    : 0

  const memory = process.memoryUsage
    ? {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      }
    : null

  return {
    timestamp: new Date().toISOString(),
    health: {
      status: health.status,
      database: health.database,
      latencyMs: health.latencyMs,
    },
    entities: {
      documents: documentCount,
      jobs: jobCount,
      narratives: narrativeCount,
      scenes: sceneCount,
      characters: characterCount,
      events: eventCount,
      peaks: peakCount,
      paragraphs: paragraphCount,
    },
    jobs: {
      byStatus: jobStatuses.map((status) => ({ status: status.status, count: status._count })),
    },
    processing: {
      avgDurationMs: avgDuration,
      minDurationMs: minDuration,
      maxDurationMs: maxDuration,
      p95DurationMs: p95Duration,
      completedCount: completedJobs.length,
    },
    providers: {
      documentParser: getConfiguredProviderName('documentParser'),
      characterAnalyzer: getConfiguredProviderName('characterAnalyzer'),
      relationshipAnalyzer: getConfiguredProviderName('relationshipAnalyzer'),
      embedding: getConfiguredProviderName('embedding'),
      search: getConfiguredProviderName('search'),
      storage: getConfiguredProviderName('storage'),
      queue: getConfiguredProviderName('queue'),
    },
    intelligenceEngines: listIntelligenceEngines().map((engine) => engine.name),
    version: health.version,
    uptime: process.uptime ? Math.round(process.uptime()) : null,
    memory,
  }
}
