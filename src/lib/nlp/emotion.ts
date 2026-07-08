/**
 * Lemniscate — Emotional Journey Engine (Task 6)
 * ----------------------------------------------------------------------------
 * Deterministic affect analysis over scenes. Combines a valence lexicon with a
 * dimensional arousal lexicon and applies contextual modifiers (negation,
 * intensifiers, diminishers). Produces per-scene emotion, an emotional peak
 * list (verbatim snippets), and a whole-narrative timeline.
 *
 * Pure & deterministic: identical input ⇒ byte-identical output. No models.
 */

import { splitSentences } from './core'
import {
  VALENCE,
  AROUSAL,
  EMOTION_WORDS,
  INTENSIFIERS,
  DIMINISHERS,
  NEGATIONS,
  normalizeToken,
  type Emotion,
} from './lexicons'
import type {
  EmotionAnalysis,
  SceneEmotion,
  EmotionTimelinePoint,
  EmotionalPeakV2,
  EmotionLabel,
} from './analysis-types'

/** Input contract: a scene's index, verbatim text and absolute start offset. */
export interface EmotionSceneInput {
  index: number
  text: string
  startOffset: number
  /** Optional pre-split sentences (avoids re-splitting when caller has them). */
  sentences?: { text: string; start: number }[]
}

// Deterministic emotion-label iteration order (drives tie-breaking).
const EMOTION_ORDER: Emotion[] = ['JOY', 'ANGER', 'FEAR', 'SADNESS', 'SURPRISE', 'DISGUST', 'LOVE']

const PEAK_THRESHOLD = 55
const MAX_PEAKS = 50

interface AffectScore {
  valence: number // [-100,100]
  arousal: number // [0,100]
  dominant: EmotionLabel
  emotionScore: number // [0,100]
}

function clampInt(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(x)))
}

/**
 * Score a block of text for valence, arousal and dominant emotion. The scan is
 * single-pass; each token inspects its immediate predecessor for a contextual
 * modifier (negation flips sign, intensifier amplifies, diminisher attenuates).
 */
function scoreAffect(text: string): AffectScore {
  const tokens = text.split(/\s+/).map(normalizeToken)
  let valenceSum = 0
  let valenceHits = 0
  let arousalSum = 0
  let arousalHits = 0
  const emotionHits: Record<Emotion, number> = {
    JOY: 0, ANGER: 0, FEAR: 0, SADNESS: 0, SURPRISE: 0, DISGUST: 0, LOVE: 0, NEUTRAL: 0,
  }

  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i]
    if (!w) continue
    const prev = tokens[i - 1]
    let mult = 1
    if (prev && NEGATIONS.has(prev)) mult = -1
    else if (prev && INTENSIFIERS.has(prev)) mult = 1.6
    else if (prev && DIMINISHERS.has(prev)) mult = 0.5

    const v = VALENCE[w]
    if (v !== undefined) { valenceSum += v * mult; valenceHits++ }

    const a = AROUSAL[w]
    if (a !== undefined) { arousalSum += a * (prev && INTENSIFIERS.has(prev) ? 1.3 : 1); arousalHits++ }

    for (const emo of EMOTION_ORDER) {
      if (EMOTION_WORDS[emo].has(w)) emotionHits[emo] += mult > 0 ? 1 : 0.2
    }
  }

  // Valence density → [-100,100] (per-hit average, scaled by lexicon range 4).
  const valenceDensity = valenceHits > 0 ? valenceSum / valenceHits : 0
  const valence = clampInt(valenceDensity * 25, -100, 100)

  // Arousal: average activation + a bounded punctuation boost.
  const exclamations = (text.match(/!/g) || []).length
  const arousalAvg = arousalHits > 0 ? arousalSum / arousalHits : 0
  const arousal = clampInt(arousalAvg * 100 + Math.min(20, exclamations * 4), 0, 100)

  // Dominant emotion — max hits, ties broken by EMOTION_ORDER.
  let dominant: EmotionLabel = 'NEUTRAL'
  let maxHits = 0
  for (const emo of EMOTION_ORDER) {
    if (emotionHits[emo] > maxHits) { maxHits = emotionHits[emo]; dominant = emo }
  }

  const emotionScore = clampInt(50 + valence / 2, 0, 100)
  return { valence, arousal, dominant, emotionScore }
}

/** Score a single sentence for peak-intensity detection. */
function scorePeak(text: string): { intensity: number; emotion: EmotionLabel } {
  const { valence, arousal, dominant } = scoreAffect(text)
  const punctuation = /[!?]{2,}/.test(text) ? 15 : 0
  // Peak intensity blends emotional charge (|valence|) with arousal.
  const intensity = clampInt(Math.abs(valence) * 0.6 + arousal * 0.4 + punctuation, 0, 100)
  return { intensity, emotion: dominant }
}

/**
 * Analyze the emotional journey across scenes. Produces per-scene emotion, a
 * ranked peak list (verbatim), and an ordered timeline.
 */
export function analyzeEmotion(scenes: EmotionSceneInput[]): EmotionAnalysis {
  const sceneEmotions: SceneEmotion[] = []
  const timeline: EmotionTimelinePoint[] = []
  const peaks: EmotionalPeakV2[] = []

  for (const scene of scenes) {
    const affect = scoreAffect(scene.text)
    sceneEmotions.push({
      sceneIndex: scene.index,
      dominant: affect.dominant,
      valence: affect.valence,
      arousal: affect.arousal,
      emotionScore: affect.emotionScore,
    })
    timeline.push({
      sceneIndex: scene.index,
      valence: affect.valence,
      arousal: affect.arousal,
      dominant: affect.dominant,
    })

    const sentences = scene.sentences ?? splitSentences(scene.text)
    for (const sent of sentences) {
      const { intensity, emotion } = scorePeak(sent.text)
      if (intensity >= PEAK_THRESHOLD) {
        peaks.push({
          offset: scene.startOffset + sent.start,
          intensity,
          emotion,
          snippet: sent.text.length > 160 ? sent.text.slice(0, 157) + '...' : sent.text,
          sceneIndex: scene.index,
        })
      }
    }
  }

  // Deterministic peak ordering: intensity desc, offset asc, snippet asc.
  peaks.sort(
    (a, b) => b.intensity - a.intensity || a.offset - b.offset || a.snippet.localeCompare(b.snippet),
  )
  return { sceneEmotions, timeline, peaks: peaks.slice(0, MAX_PEAKS) }
}

export { scoreAffect }
