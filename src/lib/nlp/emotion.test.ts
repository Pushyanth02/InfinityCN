import { describe, it, expect } from 'vitest'
import { analyzeEmotion, scoreAffect } from './emotion'

describe('[unit] emotion — affect scoring', () => {
  it('scores positive text with positive valence', () => {
    expect(scoreAffect('She felt joyful, happy and full of love.').valence).toBeGreaterThan(0)
  })

  it('scores negative text with negative valence', () => {
    expect(scoreAffect('He was filled with grief, fear and despair.').valence).toBeLessThan(0)
  })

  it('flips valence under negation', () => {
    const plain = scoreAffect('She was happy.').valence
    const negated = scoreAffect('She was not happy.').valence
    expect(negated).toBeLessThan(plain)
  })

  it('raises arousal for high-activation words', () => {
    const calm = scoreAffect('The calm, quiet, peaceful evening.').arousal
    const intense = scoreAffect('Terror and panic and rage exploded.').arousal
    expect(intense).toBeGreaterThan(calm)
  })

  it('bounds all scores', () => {
    const s = scoreAffect('Rage! Terror! Fury! Panic! Horror!')
    expect(s.valence).toBeGreaterThanOrEqual(-100)
    expect(s.valence).toBeLessThanOrEqual(100)
    expect(s.arousal).toBeGreaterThanOrEqual(0)
    expect(s.arousal).toBeLessThanOrEqual(100)
    expect(s.emotionScore).toBeGreaterThanOrEqual(0)
    expect(s.emotionScore).toBeLessThanOrEqual(100)
  })
})

describe('[unit] emotion — journey', () => {
  const scenes = [
    { index: 0, text: 'A calm and peaceful morning by the quiet lake.', startOffset: 0 },
    { index: 1, text: 'Suddenly terror struck! She screamed in panic and fear!', startOffset: 100 },
    { index: 2, text: 'At last, joy and love returned, and they smiled happily.', startOffset: 200 },
  ]

  it('produces one emotion + timeline point per scene', () => {
    const a = analyzeEmotion(scenes)
    expect(a.sceneEmotions).toHaveLength(3)
    expect(a.timeline).toHaveLength(3)
    a.sceneEmotions.forEach((s, i) => expect(s.sceneIndex).toBe(i))
  })

  it('grounds every peak snippet verbatim in its scene text', () => {
    const a = analyzeEmotion(scenes)
    for (const p of a.peaks) {
      expect(p.sceneIndex).not.toBeNull()
      const scene = scenes[p.sceneIndex!]
      const snippet = p.snippet.replace(/\.\.\.$/, '')
      expect(scene.text).toContain(snippet)
    }
  })

  it('orders peaks by descending intensity and is deterministic', () => {
    const a = analyzeEmotion(scenes)
    for (let i = 1; i < a.peaks.length; i++) {
      expect(a.peaks[i - 1].intensity).toBeGreaterThanOrEqual(a.peaks[i].intensity)
    }
    expect(JSON.stringify(analyzeEmotion(scenes))).toBe(JSON.stringify(a))
  })

  it('handles empty input', () => {
    const a = analyzeEmotion([])
    expect(a.sceneEmotions).toEqual([])
    expect(a.peaks).toEqual([])
  })
})
