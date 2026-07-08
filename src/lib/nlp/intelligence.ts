/**
 * Lemniscate — Character Intelligence Engine (Task 4)
 * ----------------------------------------------------------------------------
 * Derives high-level narrative roles and metrics from the detected-character
 * set + co-occurrence graph. Every ranking uses a weighted, deterministic
 * scoring function — no randomness, no models. Identical input ⇒ identical
 * output.
 */

import type {
  CharacterAnalysis,
  CharacterIntelligence,
  DetectedCharacter,
  CharacterRoleV2,
  RankedCharacter,
} from './analysis-types'

// Scoring weights (documented, tunable, deterministic).
const W_PROTAGONIST = { importance: 0.5, speaking: 0.25, scenes: 0.25 } as const
const W_SUPPORTING = { scenes: 0.5, speaking: 0.3, importance: 0.2 } as const
const W_VIEWPOINT = { scenes: 0.6, importance: 0.4 } as const
// A supporting character must clear this importance floor; below it ⇒ MINOR.
const MINOR_IMPORTANCE_CEILING = 15

/** Protagonist likelihood — dominance across mentions, dialogue and presence. */
function protagonistScore(c: DetectedCharacter, sceneCount: number): number {
  const sceneRatio = sceneCount > 0 ? c.scenes.length / sceneCount : 0
  return (
    W_PROTAGONIST.importance * c.importanceScore +
    W_PROTAGONIST.speaking * Math.min(100, c.speakingCount * 10) +
    W_PROTAGONIST.scenes * (sceneRatio * 100)
  )
}

/** Supporting likelihood — present and active, but not dominant. */
function supportingScore(c: DetectedCharacter, sceneCount: number): number {
  const sceneRatio = sceneCount > 0 ? c.scenes.length / sceneCount : 0
  return (
    W_SUPPORTING.scenes * (sceneRatio * 100) +
    W_SUPPORTING.speaking * Math.min(100, c.speakingCount * 10) +
    W_SUPPORTING.importance * c.importanceScore
  )
}

function viewpointScore(c: DetectedCharacter, sceneCount: number): number {
  const sceneRatio = sceneCount > 0 ? c.scenes.length / sceneCount : 0
  return W_VIEWPOINT.scenes * (sceneRatio * 100) + W_VIEWPOINT.importance * c.importanceScore
}

function round2(x: number): number {
  return Math.round(x * 100) / 100
}

/**
 * Compute narrative intelligence from a character analysis.
 *
 * @param analysis  detected characters + co-occurrence graph
 * @param sceneCount total number of scenes (for presence ratios)
 */
export function computeIntelligence(analysis: CharacterAnalysis, sceneCount: number): CharacterIntelligence {
  const { characters, coOccurrence } = analysis

  if (characters.length === 0) {
    return {
      protagonistRanking: [],
      supportingRanking: [],
      antagonistId: null,
      viewpointId: null,
      narrativeFocus: 0,
      speakingDominance: 0,
      sceneParticipation: 0,
    }
  }

  // ---- Protagonist ranking (weighted, stable total order) ----------------
  const protagonistRanking: RankedCharacter[] = characters
    .map((c) => ({ id: c.id, name: c.canonicalName, score: round2(protagonistScore(c, sceneCount)) }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))

  const protagonistId = protagonistRanking[0]?.id ?? null

  // ---- Supporting ranking (exclude the protagonist) ----------------------
  const supportingRanking: RankedCharacter[] = characters
    .filter((c) => c.id !== protagonistId)
    .map((c) => ({ id: c.id, name: c.canonicalName, score: round2(supportingScore(c, sceneCount)) }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))

  // ---- Antagonist estimation ---------------------------------------------
  // The antagonist is the non-protagonist most entangled with the protagonist
  // (shared scenes) and independently important. Falls back to the second most
  // important character when there is no co-occurrence signal.
  let antagonistId: string | null = null
  if (characters.length >= 2 && protagonistId) {
    const coWithProtagonist = new Map<string, number>()
    for (const e of coOccurrence.edges) {
      if (e.source === protagonistId) coWithProtagonist.set(e.target, e.weight)
      else if (e.target === protagonistId) coWithProtagonist.set(e.source, e.weight)
    }
    const importanceById = new Map(characters.map((c) => [c.id, c.importanceScore]))
    let best: { id: string; score: number } | null = null
    for (const c of characters) {
      if (c.id === protagonistId) continue
      const co = coWithProtagonist.get(c.id) ?? 0
      const score = co * 20 + (importanceById.get(c.id) ?? 0)
      if (!best || score > best.score || (score === best.score && c.id.localeCompare(best.id) < 0)) {
        best = { id: c.id, score }
      }
    }
    antagonistId = best?.id ?? null
  }

  // ---- Viewpoint estimation ----------------------------------------------
  const viewpoint = [...characters]
    .map((c) => ({ id: c.id, score: viewpointScore(c, sceneCount), first: c.firstAppearanceOffset }))
    .sort((a, b) => b.score - a.score || a.first - b.first || a.id.localeCompare(b.id))[0]
  const viewpointId = viewpoint?.id ?? null

  // ---- Aggregate metrics --------------------------------------------------
  const totalMentions = characters.reduce((s, c) => s + c.mentions, 0)
  const totalSpeaking = characters.reduce((s, c) => s + c.speakingCount, 0)
  const topMentions = Math.max(...characters.map((c) => c.mentions))
  const topSpeaking = Math.max(...characters.map((c) => c.speakingCount))
  const narrativeFocus = totalMentions > 0 ? round2(topMentions / totalMentions) : 0
  const speakingDominance = totalSpeaking > 0 ? round2(topSpeaking / totalSpeaking) : 0
  const sceneParticipation =
    sceneCount > 0 && characters.length > 0
      ? round2(characters.reduce((s, c) => s + c.scenes.length / sceneCount, 0) / characters.length)
      : 0

  return {
    protagonistRanking,
    supportingRanking,
    antagonistId,
    viewpointId,
    narrativeFocus,
    speakingDominance,
    sceneParticipation,
  }
}

/**
 * Assign a final narrative role to every character from the computed
 * intelligence. Returns a new array (does not mutate the input) with `role`
 * set. Deterministic.
 */
export function assignRoles(
  characters: DetectedCharacter[],
  intelligence: CharacterIntelligence,
): DetectedCharacter[] {
  const protagonistId = intelligence.protagonistRanking[0]?.id ?? null
  const antagonistId = intelligence.antagonistId
  return characters.map((c) => {
    let role: CharacterRoleV2
    if (c.id === protagonistId) role = 'PROTAGONIST'
    else if (c.id === antagonistId) role = 'ANTAGONIST'
    else if (c.importanceScore >= MINOR_IMPORTANCE_CEILING) role = 'SUPPORTING'
    else role = 'MINOR'
    return { ...c, role }
  })
}
