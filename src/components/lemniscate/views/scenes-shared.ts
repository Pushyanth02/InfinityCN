/**
 * Lemniscate — Scene explorer shared types & helpers
 * ----------------------------------------------------------------------------
 * The scene view's narrative shape, the persisted-structure parser, the
 * structural-phase labels, and the scene-heading builder. Extracted verbatim
 * from `scenes.tsx`; behavior is unchanged. Kept standalone so the helpers can
 * be reused/tested without pulling in the full view.
 */

import type { ApiScene, ApiNarrativeArc, ApiStoryStructure } from '@/lib/types'

export interface NarrativeData {
  id: string
  title: string
  mode: string
  scenes: ApiScene[]
  arcs: ApiNarrativeArc[]
  /** JSON string with intelligence/timelines/structure. */
  metadata?: string
}

/** Parse the persisted story structure from Narrative.metadata JSON. */
export function parseStructure(raw: unknown): ApiStoryStructure | null {
  if (typeof raw !== 'string' || !raw || raw === '{}') return null
  try {
    const p = JSON.parse(raw) as { structure?: ApiStoryStructure }
    return p.structure && Array.isArray(p.structure.segments) ? p.structure : null
  } catch {
    return null
  }
}

/** Human-readable label for a structural phase. */
export const PHASE_LABEL: Record<string, string> = {
  EXPOSITION: 'Exposition',
  INCITING_INCIDENT: 'Inciting Incident',
  RISING_ACTION: 'Rising Action',
  MIDPOINT: 'Midpoint',
  CLIMAX: 'Climax',
  FALLING_ACTION: 'Falling Action',
  RESOLUTION: 'Resolution',
}

/** Build an INT./EXT. LOCATION — TIME heading from scene fields (not persisted in DB). */
export function buildSceneHeading(scene: Pick<ApiScene, 'location' | 'timeOfDay'>): string {
  const loc = scene.location?.trim()
  const locText = loc ? loc.toUpperCase() : 'UNKNOWN LOCATION'
  const tod = scene.timeOfDay || 'CONTINUOUS'
  return `${locText} — ${tod}`
}
