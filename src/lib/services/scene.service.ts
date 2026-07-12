import { db } from '@/lib/db'
import { NotFoundError } from '@/lib/domain/errors'

export interface SceneListOptions {
  narrativeId: string
  limit?: number
  offset?: number
  minTension?: number
  structurePhase?: string
}

export async function listScenes(opts: SceneListOptions) {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50))
  const offset = Math.max(0, opts.offset ?? 0)
  const where: { narrativeId: string; tensionScore?: { gte: number }; structurePhase?: string } = { narrativeId: opts.narrativeId }
  if (opts.minTension != null) where.tensionScore = { gte: opts.minTension }
  if (opts.structurePhase) where.structurePhase = opts.structurePhase
  const [scenes, total] = await Promise.all([
    db.scene.findMany({ where, orderBy: { index: 'asc' }, take: limit, skip: offset, include: { events: { orderBy: { index: 'asc' } } } }),
    db.scene.count({ where }),
  ])
  return { scenes, total }
}

export async function getSceneByIndex(narrativeId: string, index: number) {
  const scene = await db.scene.findFirst({ where: { narrativeId, index }, include: { events: { orderBy: { index: 'asc' } }, peaks: { orderBy: { intensity: 'desc' } } } })
  if (!scene) throw new NotFoundError('Scene ' + index + ' not found')
  return scene
}

export async function getHighTensionScenes(narrativeId: string, limit = 10) {
  return db.scene.findMany({ where: { narrativeId, tensionScore: { gte: 50 } }, orderBy: { tensionScore: 'desc' }, take: Math.min(50, limit), select: { id: true, index: true, title: true, summary: true, tensionScore: true, emotionScore: true, mood: true, dominantEmotion: true } })
}

export async function getSceneTimeline(narrativeId: string) {
  return db.scene.findMany({ where: { narrativeId }, orderBy: { index: 'asc' }, select: { index: true, title: true, tensionScore: true, emotionScore: true, momentumScore: true, arousalScore: true, valence: true, dominantEmotion: true, structurePhase: true, startOffset: true, endOffset: true } })
}
