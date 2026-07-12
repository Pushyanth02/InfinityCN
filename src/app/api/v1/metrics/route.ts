/**
 * GET /api/v1/metrics — System metrics and observability
 *
 * Returns system metrics: database stats, provider configuration,
 * processing pipeline health, and performance counters.
 */
import { NextRequest } from 'next/server'
import '@/lib/providers'
import { db } from '@/lib/db'
import { getConfiguredProviderName } from '@/lib/providers/registry'
import { listIntelligenceEngines } from '@/lib/intelligence'
import { apiSuccess, apiError } from '@/lib/api/response'
import { securityCheck } from '@/lib/middleware/security'
import { getClientIP } from '@/lib/middleware/rate-limit'
import { checkHealth } from '@/lib/services/job.service'

export async function GET(req: NextRequest) {
  try {
    const blocked = await securityCheck(req, `metrics:${getClientIP(req)}`, 30)
    if (blocked) return blocked

    const health = await checkHealth()

    // Database metrics
    const [
      documentCount,
      jobCount,
      narrativeCount,
      sceneCount,
      characterCount,
      eventCount,
      peakCount,
      paragraphCount,
    ] = await Promise.all([
      db.document.count(),
      db.job.count(),
      db.narrative.count(),
      db.scene.count(),
      db.character.count(),
      db.event.count(),
      db.emotionalPeak.count(),
      db.paragraph.count(),
    ])

    // Job status distribution
    const jobStatuses = await db.job.groupBy({ by: ['status'], _count: true })

    // Provider configuration
    const providers = {
      documentParser: getConfiguredProviderName('documentParser'),
      characterAnalyzer: getConfiguredProviderName('characterAnalyzer'),
      relationshipAnalyzer: getConfiguredProviderName('relationshipAnalyzer'),
      embedding: getConfiguredProviderName('embedding'),
      search: getConfiguredProviderName('search'),
      storage: getConfiguredProviderName('storage'),
      queue: getConfiguredProviderName('queue'),
    }

    // Processing performance metrics
    const completedJobs = await db.job.findMany({
      where: { status: 'COMPLETED', durationMs: { not: null } },
      select: { durationMs: true },
      take: 100,
      orderBy: { completedAt: 'desc' },
    })

    const durations = completedJobs
      .map((j) => j.durationMs ?? 0)
      .filter((d) => d > 0)

    const avgDuration = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0
    const maxDuration = durations.length > 0 ? Math.max(...durations) : 0
    const minDuration = durations.length > 0 ? Math.min(...durations) : 0
    const p95Duration = durations.length > 0
      ? durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)] ?? 0
      : 0

    const metrics = {
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
        byStatus: jobStatuses.map((s) => ({ status: s.status, count: s._count })),
      },
      processing: {
        avgDurationMs: avgDuration,
        minDurationMs: minDuration,
        maxDurationMs: maxDuration,
        p95DurationMs: p95Duration,
        completedCount: completedJobs.length,
      },
      providers,
      // Narrative analysis moved from a provider slot to the Document
      // Intelligence Engine registry (M2/M3) — report the registered engines.
      intelligenceEngines: listIntelligenceEngines().map((e) => e.name),
      version: health.version,
      uptime: process.uptime ? Math.round(process.uptime()) : null,
      memory: process.memoryUsage ? {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      } : null,
    }

    return apiSuccess(metrics)
  } catch (err) {
    return apiError(err)
  }
}
