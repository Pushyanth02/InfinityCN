/**
 * Lemniscate — Narrative Momentum Engine (Task 7)
 * ----------------------------------------------------------------------------
 * Produces a normalized 0–100 momentum timeline. Momentum is the forward drive
 * of the narrative — a deterministic blend of pacing, conflict, action,
 * dialogue intensity, urgency, lexical intensity and sentiment transitions.
 *
 * Pure & deterministic. No models, no randomness.
 */

import { splitSentences } from './core'
import {
  CONFLICT_LEXICON,
  VIOLENCE_LEXICON,
  ACTION_VERBS_LEXICON,
  URGENCY,
  INTENSIFIERS,
  AROUSAL,
  normalizeToken,
} from './lexicons'
import type { MomentumAnalysis, MomentumPoint } from './analysis-types'

/** Input contract for one scene. `valence` is the scene valence in [-100,100]. */
export interface MomentumSceneInput {
  index: number
  text: string
  dialogueRatio: number
  valence: number
}

// Component weights (sum = 1.0). Documented + deterministic.
const WEIGHTS = {
  pacing: 0.15,
  conflict: 0.2,
  action: 0.2,
  dialogue: 0.1,
  urgency: 0.15,
  lexicalIntensity: 0.1,
  sentimentShift: 0.1,
} as const

function clampInt(x: number): number {
  return Math.max(0, Math.min(100, Math.round(x)))
}

/** Count how many normalized tokens fall in a lexicon set. */
function countHits(tokens: string[], lex: Set<string>): number {
  let n = 0
  for (const t of tokens) if (lex.has(t)) n++
  return n
}

/**
 * Compute the seven momentum components for one scene. Each component is
 * normalized to [0,100]. Density scale factors are chosen so typical prose
 * lands mid-range while dense action/conflict passages approach the ceiling.
 */
function sceneComponents(
  scene: MomentumSceneInput,
  prevValence: number | null,
): MomentumPoint['components'] {
  const tokens = scene.text.split(/\s+/).map(normalizeToken).filter(Boolean)
  const wordCount = Math.max(1, tokens.length)
  const sentences = splitSentences(scene.text)
  const avgWordsPerSentence = sentences.length > 0 ? wordCount / sentences.length : wordCount

  // Pacing: shorter sentences ⇒ faster pace ⇒ higher momentum.
  const pacing = clampInt(120 - avgWordsPerSentence * 4)

  const conflictHits = countHits(tokens, CONFLICT_LEXICON) + countHits(tokens, VIOLENCE_LEXICON)
  const conflict = clampInt((conflictHits / wordCount) * 1000)

  const actionHits = countHits(tokens, ACTION_VERBS_LEXICON)
  const action = clampInt((actionHits / wordCount) * 1000)

  const dialogue = clampInt(scene.dialogueRatio * 100)

  const urgencyHits = countHits(tokens, URGENCY)
  const urgency = clampInt((urgencyHits / wordCount) * 1000)

  let intensityHits = countHits(tokens, INTENSIFIERS)
  for (const t of tokens) if (AROUSAL[t] !== undefined && AROUSAL[t] >= 0.6) intensityHits++
  const lexicalIntensity = clampInt((intensityHits / wordCount) * 800)

  const sentimentShift = prevValence === null ? 0 : clampInt(Math.abs(scene.valence - prevValence))

  return { pacing, conflict, action, dialogue, urgency, lexicalIntensity, sentimentShift }
}

/** Analyze narrative momentum across scenes. */
export function analyzeMomentum(scenes: MomentumSceneInput[]): MomentumAnalysis {
  const timeline: MomentumPoint[] = []
  let prevValence: number | null = null
  let peakSceneIndex = -1
  let peakScore = -1

  for (const scene of scenes) {
    const components = sceneComponents(scene, prevValence)
    const score = clampInt(
      WEIGHTS.pacing * components.pacing +
        WEIGHTS.conflict * components.conflict +
        WEIGHTS.action * components.action +
        WEIGHTS.dialogue * components.dialogue +
        WEIGHTS.urgency * components.urgency +
        WEIGHTS.lexicalIntensity * components.lexicalIntensity +
        WEIGHTS.sentimentShift * components.sentimentShift,
    )
    timeline.push({ sceneIndex: scene.index, score, components })
    if (score > peakScore) { peakScore = score; peakSceneIndex = scene.index }
    prevValence = scene.valence
  }

  return { timeline, peakSceneIndex }
}
