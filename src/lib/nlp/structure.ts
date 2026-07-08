/**
 * Lemniscate — Story Structure Engine (Task 8)
 * ----------------------------------------------------------------------------
 * Detects the classical dramatic phases (exposition → inciting incident →
 * rising action → midpoint → climax → falling action → resolution) from
 * deterministic weighted signals: the momentum timeline plus arc-signal
 * lexicons. It deliberately replaces the previous equal-segment partitioning —
 * landmarks are placed where the signals actually peak, not at fixed fractions.
 *
 * Pure & deterministic. No models, no randomness.
 */

import {
  ARC_INCITING_SIGNALS,
  ARC_CLIMAX_SIGNALS,
  ARC_RESOLUTION_SIGNALS,
  normalizeToken,
} from './lexicons'
import type { MomentumPoint, StoryStructure, StructureSegment, StructurePhase } from './analysis-types'

/** Input contract: a scene index and its verbatim text (for arc signals). */
export interface StructureSceneInput {
  index: number
  text: string
}

function clampInt(x: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(x)))
}

/** Count lexicon hits (single words) in a scene's normalized tokens. */
function signalCount(tokens: string[], lex: Set<string>): number {
  let n = 0
  for (const t of tokens) if (lex.has(t)) n++
  return n
}

/**
 * Detect story structure from scenes + their momentum timeline.
 *
 * @param scenes   scene index + verbatim text (arc-signal source)
 * @param momentum per-scene momentum timeline (aligned by array position)
 */
export function analyzeStructure(scenes: StructureSceneInput[], momentum: MomentumPoint[]): StoryStructure {
  const n = scenes.length
  if (n === 0) {
    return { segments: [], incitingIncidentScene: -1, midpointScene: -1, climaxScene: -1 }
  }

  const m = momentum.map((p) => p.score)
  const meanMomentum = m.reduce((a, b) => a + b, 0) / n

  // Per-scene arc signals (single pass).
  const inciteSig: number[] = []
  const climaxSig: number[] = []
  const resolveSig: number[] = []
  for (const s of scenes) {
    const tokens = s.text.split(/\s+/).map(normalizeToken).filter(Boolean)
    inciteSig.push(signalCount(tokens, ARC_INCITING_SIGNALS))
    climaxSig.push(signalCount(tokens, ARC_CLIMAX_SIGNALS))
    resolveSig.push(signalCount(tokens, ARC_RESOLUTION_SIGNALS))
  }

  if (n === 1) {
    return {
      segments: [{ phase: 'EXPOSITION', startSceneIndex: 0, endSceneIndex: 0, confidence: 50 }],
      incitingIncidentScene: -1,
      midpointScene: -1,
      climaxScene: 0,
    }
  }

  // ---- Climax: global momentum peak (earliest on ties), reinforced by arc ----
  let climax = 0
  let climaxScore = -1
  for (let i = 0; i < n; i++) {
    const score = m[i] + climaxSig[i] * 8
    if (score > climaxScore) { climaxScore = score; climax = i }
  }

  // ---- Inciting incident: strongest early momentum jump + inciting signal ----
  // Search the first portion of the story, before the climax.
  const incitingUpper = Math.max(1, climax - 1)
  let inciting = Math.min(1, n - 1)
  let incitingScore = -1
  for (let i = 1; i <= incitingUpper; i++) {
    const delta = m[i] - m[i - 1]
    const score = delta + inciteSig[i] * 10
    if (score > incitingScore) { incitingScore = score; inciting = i }
  }

  // ---- Midpoint: strongest momentum between inciting and climax --------------
  let midpoint = -1
  let midScore = -1
  for (let i = inciting + 1; i <= climax - 1; i++) {
    if (m[i] > midScore) { midScore = m[i]; midpoint = i }
  }

  // ---- Resolution start: first post-climax scene whose momentum subsides -----
  // (reinforced by resolution arc signals). If the climax is the final scene,
  // there is no falling action or resolution.
  let resolutionStart = -1
  const subsideThreshold = climaxScore >= 0 ? m[climax] * 0.5 : 0
  for (let i = climax + 1; i < n; i++) {
    if (m[i] <= subsideThreshold || resolveSig[i] > 0) { resolutionStart = i; break }
  }
  if (resolutionStart === -1 && climax < n - 1) resolutionStart = n - 1

  // ---- Assign a phase to every scene ----------------------------------------
  const phases: StructurePhase[] = new Array(n)
  for (let i = 0; i < n; i++) {
    if (i < inciting) phases[i] = 'EXPOSITION'
    else if (i === inciting) phases[i] = 'INCITING_INCIDENT'
    else if (midpoint >= 0 && i === midpoint) phases[i] = 'MIDPOINT'
    else if (i < climax) phases[i] = 'RISING_ACTION'
    else if (i === climax) phases[i] = 'CLIMAX'
    else if (resolutionStart >= 0 && i >= resolutionStart) phases[i] = 'RESOLUTION'
    else phases[i] = 'FALLING_ACTION'
  }

  // ---- Coalesce contiguous same-phase scenes into segments ------------------
  const segments: StructureSegment[] = []
  let runStart = 0
  for (let i = 1; i <= n; i++) {
    if (i === n || phases[i] !== phases[runStart]) {
      const phase = phases[runStart]
      segments.push({
        phase,
        startSceneIndex: runStart,
        endSceneIndex: i - 1,
        confidence: phaseConfidence(phase, {
          climaxScore: m[climax],
          meanMomentum,
          midScore: midpoint >= 0 ? m[midpoint] : 0,
          incitingSignal: incitingScore,
        }),
      })
      runStart = i
    }
  }

  return { segments, incitingIncidentScene: inciting, midpointScene: midpoint, climaxScene: climax }
}

/** Deterministic per-phase confidence from landmark prominence. */
function phaseConfidence(
  phase: StructurePhase,
  ctx: { climaxScore: number; meanMomentum: number; midScore: number; incitingSignal: number },
): number {
  switch (phase) {
    case 'CLIMAX':
      return clampInt(50 + (ctx.climaxScore - ctx.meanMomentum))
    case 'MIDPOINT':
      return clampInt(40 + (ctx.midScore - ctx.meanMomentum))
    case 'INCITING_INCIDENT':
      return clampInt(40 + Math.max(0, ctx.incitingSignal))
    case 'EXPOSITION':
    case 'RESOLUTION':
      return 60
    case 'RISING_ACTION':
    case 'FALLING_ACTION':
    default:
      return 55
  }
}
