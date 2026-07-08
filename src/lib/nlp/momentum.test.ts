import { describe, it, expect } from 'vitest'
import { analyzeMomentum } from './momentum'

const CALM = { index: 0, text: 'The gentle evening settled slowly over the quiet, peaceful meadow as the soft light faded.', dialogueRatio: 0, valence: 20 }
const ACTION = { index: 1, text: 'He ran! She grabbed the blade and struck. They fought, rushing, charging, slashing in fury!', dialogueRatio: 0.1, valence: -60 }

describe('[unit] momentum — scoring', () => {
  it('scores high-action scenes above calm scenes', () => {
    const a = analyzeMomentum([CALM, ACTION])
    expect(a.timeline[1].score).toBeGreaterThan(a.timeline[0].score)
  })

  it('bounds every score and component to [0,100]', () => {
    const a = analyzeMomentum([CALM, ACTION])
    for (const p of a.timeline) {
      expect(p.score).toBeGreaterThanOrEqual(0)
      expect(p.score).toBeLessThanOrEqual(100)
      for (const v of Object.values(p.components)) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
    }
  })

  it('reports the peak scene index', () => {
    const a = analyzeMomentum([CALM, ACTION])
    expect(a.peakSceneIndex).toBe(1)
  })

  it('has zero sentiment shift on the first scene', () => {
    const a = analyzeMomentum([CALM, ACTION])
    expect(a.timeline[0].components.sentimentShift).toBe(0)
  })

  it('produces one point per scene and is deterministic', () => {
    const a = analyzeMomentum([CALM, ACTION])
    expect(a.timeline).toHaveLength(2)
    expect(JSON.stringify(analyzeMomentum([CALM, ACTION]))).toBe(JSON.stringify(a))
  })

  it('handles empty input', () => {
    const a = analyzeMomentum([])
    expect(a.timeline).toEqual([])
    expect(a.peakSceneIndex).toBe(-1)
  })
})
