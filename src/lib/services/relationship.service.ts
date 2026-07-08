/**
 * Lemniscate — Relationship Service
 * ----------------------------------------------------------------------------
 * API-facing service for relationship graph data. Reads detected characters
 * and scene participation from the database, invokes the Relationship Engine
 * via the provider abstraction, and returns the social graph.
 */

import { db } from '@/lib/db'
import { getRelationshipAnalyzer } from '@/lib/providers'
import { NotFoundError } from '@/lib/domain/errors'
import type { DetectedCharacter } from '@/lib/nlp/analysis-types'
import type { RelationshipGraph } from '@/lib/domain/entities'
import type { RelationshipAnalysisInput } from '@/lib/providers/types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('relationship-service')

// ─── Types ────────────────────────────────────────────────────────────────

export interface RelationshipGraphResponse {
  narrativeId: string
  graph: RelationshipGraph
  generated: boolean
}

// ─── Service methods ──────────────────────────────────────────────────────

/**
 * Get the relationship graph for a narrative.
 * Reads characters + scenes from the DB and runs the relationship analyzer.
 */
export async function getRelationshipGraph(narrativeId: string): Promise<RelationshipGraphResponse> {
  const narrative = await db.narrative.findUnique({
    where: { id: narrativeId },
    select: { id: true, mode: true, sceneCount: true },
  })
  if (!narrative) throw new NotFoundError(`Narrative '${narrativeId}' not found`)

  // Load characters with their parsed metadata
  const characterRows = await db.character.findMany({
    where: { narrativeId },
    orderBy: { mentions: 'desc' },
  })

  if (characterRows.length === 0) {
    return {
      narrativeId,
      graph: { edges: [], centralities: [], communities: [], edgeCount: 0, maxStrength: 0 },
      generated: false,
    }
  }

  // Convert DB characters to DetectedCharacter shape
  const characters: DetectedCharacter[] = characterRows.map((c) => {
    const meta = safeParse(c.metadata) as Record<string, unknown>
    return {
      id: String(meta.id ?? c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
      canonicalName: c.name,
      aliases: safeParseArr(c.aliases),
      honorifics: Array.isArray(meta.honorifics) ? meta.honorifics : [],
      gender: (meta.gender ?? 'UNKNOWN') as DetectedCharacter['gender'],
      mentions: c.mentions,
      nameMentions: c.mentions,
      resolvedPronounMentions: 0,
      speakingCount: c.speakingCount,
      scenes: Array.isArray(meta.scenes) ? meta.scenes : [],
      firstAppearanceOffset: c.firstAppearanceOffset,
      lastAppearanceOffset: c.lastAppearanceOffset,
      importanceScore: c.importanceScore,
      confidenceScore: c.confidenceScore,
      role: c.role as DetectedCharacter['role'],
    }
  })

  // Build scene participants map from character scene membership
  const sceneParticipants = new Map<number, Set<string>>()
  for (const c of characters) {
    for (const sceneIdx of c.scenes) {
      if (!sceneParticipants.has(sceneIdx)) {
        sceneParticipants.set(sceneIdx, new Set())
      }
      sceneParticipants.get(sceneIdx)!.add(c.id)
    }
  }

  // Load dialogue lines from paragraphs
  const dialogueParagraphs = await db.paragraph.findMany({
    where: { narrativeId, type: 'DIALOGUE', speaker: { not: null } },
    select: { speaker: true, startOffset: true, text: true },
    orderBy: { startOffset: 'asc' },
  })

  const dialogueLines = dialogueParagraphs.map((p) => ({
    speaker: p.speaker ?? '',
    offset: p.startOffset,
    text: p.text,
  }))

  const input: RelationshipAnalysisInput = {
    characters,
    sceneParticipants,
    dialogueLines,
    totalScenes: narrative.sceneCount,
  }

  // Run the relationship analyzer via the provider
  const analyzer = await getRelationshipAnalyzer()
  const graph = await analyzer.analyze(input)

  logger.info('Relationship graph generated', {
    narrativeId,
    edges: graph.edgeCount,
    characters: characters.length,
    communities: graph.communities.length,
  })

  return { narrativeId, graph, generated: true }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}

function safeParseArr(s: string): string[] {
  try {
    const arr = JSON.parse(s)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
