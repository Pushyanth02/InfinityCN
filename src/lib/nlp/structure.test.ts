import { describe, it, expect } from 'vitest'
import { analyzeStructure, type StructureSceneInput } from './structure'
import type { MomentumPoint } from './analysis-types'

/** Build a momentum timeline from bare scores (components are irrelevant here). */
function momentum(scores: number[]): MomentumPoint[] {
  return scores.map((score, i) => ({
    sceneIndex: i,
    score,
    components: { pacing: 0, conflict: 0, action: 0, dialogue: 0, urgency: 0, lexicalIntensity: 0, sentimentShift: 0 },
  }))
}

function scenes(n: number): StructureSceneInput[] {
  return Array.from({ length: n }, (_, i) => ({ index: i, text: `Neutral scene text number ${i}.` }))
}

const VALID_PHASES = new Set([
  'EXPOSITION', 'INCITING_INCIDENT', 'RISING_ACTION', 'MIDPOINT', 'CLIMAX', 'FALLING_ACTION', 'RESOLUTION',
])

describe('[unit] structure — phase detection', () => {
  const scores = [10, 20, 40, 55, 90, 50, 20]

  it('places the climax at the global momentum peak', () => {
    const s = analyzeStructure(scenes(7), momentum(scores))
    expect(s.climaxScene).toBe(4)
  })

  it('orders the landmarks (inciting < midpoint < climax)', () => {
    const s = analyzeStructure(scenes(7), momentum(scores))
    expect(s.incitingIncidentScene).toBeGreaterThanOrEqual(0)
    expect(s.incitingIncidentScene).toBeLessThan(s.climaxScene)
    if (s.midpointScene >= 0) {
      expect(s.midpointScene).toBeGreaterThan(s.incitingIncidentScene)
      expect(s.midpointScene).toBeLessThan(s.climaxScene)
    }
  })

  it('covers every scene with contiguous, valid-phase segments', () => {
    const s = analyzeStructure(scenes(7), momentum(scores))
    expect(s.segments[0].startSceneIndex).toBe(0)
    expect(s.segments[s.segments.length - 1].endSceneIndex).toBe(6)
    for (let i = 1; i < s.segments.length; i++) {
      expect(s.segments[i].startSceneIndex).toBe(s.segments[i - 1].endSceneIndex + 1)
    }
    for (const seg of s.segments) {
      expect(VALID_PHASES.has(seg.phase)).toBe(true)
      expect(seg.confidence).toBeGreaterThanOrEqual(0)
      expect(seg.confidence).toBeLessThanOrEqual(100)
    }
  })

  it('is not an equal partition (landmarks driven by signal)', () => {
    // A late-peaking curve must place the climax late, not at the midpoint.
    const late = analyzeStructure(scenes(7), momentum([10, 12, 14, 16, 18, 20, 95]))
    expect(late.climaxScene).toBe(6)
  })

  it('handles single-scene and empty inputs', () => {
    const one = analyzeStructure(scenes(1), momentum([50]))
    expect(one.segments).toHaveLength(1)
    expect(one.segments[0].phase).toBe('EXPOSITION')
    const none = analyzeStructure([], [])
    expect(none.segments).toEqual([])
    expect(none.climaxScene).toBe(-1)
  })

  it('is deterministic', () => {
    const a = analyzeStructure(scenes(7), momentum(scores))
    const b = analyzeStructure(scenes(7), momentum(scores))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
