import { describe, it, expect } from 'vitest'
import { transformOriginal } from '../pipeline/original'
import { analyzeCharacters } from './characters'
import { detectScenes } from './scenes'
import { computeIntelligence, assignRoles } from './intelligence'
import { MULTI_ANTAGONIST, MULTI_PROTAGONIST, LOW_DIALOGUE } from './__fixtures__/books'

function analyze(text: string) {
  const original = transformOriginal(text)
  const paras = original.paragraphs.map((p) => ({ text: p.text, startOffset: p.startOffset }))
  const segments = detectScenes(original.paragraphs)
  const ranges = segments.map((s) => ({ index: s.index, startOffset: s.startOffset, endOffset: s.endOffset }))
  const analysis = analyzeCharacters(text, paras, ranges)
  return { analysis, sceneCount: segments.length }
}

describe('[unit] intelligence — ranking & roles', () => {
  it('ranks the most-present character as protagonist', () => {
    const { analysis, sceneCount } = analyze(MULTI_ANTAGONIST)
    const intel = computeIntelligence(analysis, sceneCount)
    expect(intel.protagonistRanking[0]?.name).toBe('Kael')
  })

  it('estimates an antagonist distinct from the protagonist', () => {
    const { analysis, sceneCount } = analyze(MULTI_ANTAGONIST)
    const intel = computeIntelligence(analysis, sceneCount)
    expect(intel.antagonistId).not.toBeNull()
    expect(intel.antagonistId).not.toBe(intel.protagonistRanking[0]?.id)
  })

  it('assigns exactly one protagonist role', () => {
    const { analysis, sceneCount } = analyze(MULTI_PROTAGONIST)
    const intel = computeIntelligence(analysis, sceneCount)
    const roled = assignRoles(analysis.characters, intel)
    expect(roled.filter((c) => c.role === 'PROTAGONIST').length).toBe(1)
    for (const c of roled) {
      expect(['PROTAGONIST', 'ANTAGONIST', 'SUPPORTING', 'MINOR']).toContain(c.role)
    }
  })

  it('bounds aggregate metrics to their valid ranges', () => {
    const { analysis, sceneCount } = analyze(MULTI_PROTAGONIST)
    const intel = computeIntelligence(analysis, sceneCount)
    for (const v of [intel.narrativeFocus, intel.speakingDominance, intel.sceneParticipation]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('handles a cast-free narrative gracefully', () => {
    const { analysis, sceneCount } = analyze(LOW_DIALOGUE)
    const intel = computeIntelligence(analysis, sceneCount)
    // No crash; rankings mirror however many (possibly zero) characters exist.
    expect(Array.isArray(intel.protagonistRanking)).toBe(true)
  })

  it('is deterministic', () => {
    const a = analyze(MULTI_ANTAGONIST)
    const b = analyze(MULTI_ANTAGONIST)
    expect(JSON.stringify(computeIntelligence(a.analysis, a.sceneCount))).toBe(
      JSON.stringify(computeIntelligence(b.analysis, b.sceneCount)),
    )
  })
})
