import { describe, it, expect } from 'vitest'
import { transformOriginal } from '../pipeline/original'
import { detectScenes } from './scenes'
import { CHAPTERED, DIALOGUE_HEAVY, LOW_DIALOGUE } from './__fixtures__/books'

function paragraphsOf(text: string) {
  return transformOriginal(text).paragraphs
}

describe('[unit] scenes — segmentation', () => {
  it('opens a new scene at every chapter heading', () => {
    const paras = paragraphsOf(CHAPTERED)
    const scenes = detectScenes(paras)
    // Five chapters ⇒ at least five scenes (plus the leading title scene).
    expect(scenes.length).toBeGreaterThanOrEqual(5)
    // Every scene records why it was opened (except the first).
    for (const s of scenes.slice(1)) expect(s.boundarySignals.length).toBeGreaterThan(0)
  })

  it('preserves paragraphs verbatim (only groups, never rewrites)', () => {
    const paras = paragraphsOf(CHAPTERED)
    const originals = new Set(paras.map((p) => p.text))
    const scenes = detectScenes(paras)
    for (const s of scenes) for (const p of s.paragraphs) expect(originals.has(p.text)).toBe(true)
  })

  it('assigns a bounded dialogue ratio', () => {
    const scenes = detectScenes(paragraphsOf(DIALOGUE_HEAVY))
    for (const s of scenes) {
      expect(s.dialogueRatio).toBeGreaterThanOrEqual(0)
      expect(s.dialogueRatio).toBeLessThanOrEqual(1)
    }
  })

  it('returns an empty array for empty input and one+ scene for prose', () => {
    expect(detectScenes([])).toEqual([])
    expect(detectScenes(paragraphsOf(LOW_DIALOGUE)).length).toBeGreaterThanOrEqual(1)
  })

  it('numbers scenes contiguously from zero', () => {
    const scenes = detectScenes(paragraphsOf(CHAPTERED))
    scenes.forEach((s, i) => expect(s.index).toBe(i))
  })

  it('is deterministic', () => {
    const paras = paragraphsOf(CHAPTERED)
    expect(JSON.stringify(detectScenes(paras))).toBe(JSON.stringify(detectScenes(paras)))
  })
})
