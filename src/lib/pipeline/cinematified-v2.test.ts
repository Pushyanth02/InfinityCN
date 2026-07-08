import { describe, it, expect } from 'vitest'
import { transformOriginal } from './original'
import { transformCinematified } from './cinematified'
import { ALL_FIXTURES } from '../nlp/__fixtures__/books'

const STRUCTURE_PHASES = new Set([
  'EXPOSITION', 'INCITING_INCIDENT', 'RISING_ACTION', 'MIDPOINT', 'CLIMAX', 'FALLING_ACTION', 'RESOLUTION',
])

function run(text: string) {
  const original = transformOriginal(text)
  return transformCinematified(text, original.paragraphs)
}

describe('[integration] Narrative Intelligence Engine v2 — cross-fixture validation', () => {
  for (const [name, text] of Object.entries(ALL_FIXTURES)) {
    describe(name, () => {
      it('produces byte-identical output across repeated runs', () => {
        expect(JSON.stringify(run(text))).toBe(JSON.stringify(run(text)))
      })

      it('never invents characters absent from the source', () => {
        const r = run(text)
        for (const c of r.characters) {
          expect(text).toContain(c.name)
          for (const a of c.aliases) expect(text).toContain(a)
        }
      })

      it('bounds every scene metric', () => {
        const r = run(text)
        for (const s of r.scenes) {
          for (const v of [s.tensionScore, s.emotionScore, s.momentumScore, s.arousalScore]) {
            expect(v).toBeGreaterThanOrEqual(0)
            expect(v).toBeLessThanOrEqual(100)
          }
          expect(s.valence).toBeGreaterThanOrEqual(-100)
          expect(s.valence).toBeLessThanOrEqual(100)
          expect(s.dialogueRatio).toBeGreaterThanOrEqual(0)
          expect(s.dialogueRatio).toBeLessThanOrEqual(1)
          if (s.structurePhase !== null) expect(STRUCTURE_PHASES.has(s.structurePhase)).toBe(true)
        }
      })

      it('bounds every character metric', () => {
        const r = run(text)
        for (const c of r.characters) {
          for (const v of [c.importanceScore, c.confidenceScore]) {
            expect(v).toBeGreaterThanOrEqual(0)
            expect(v).toBeLessThanOrEqual(100)
          }
          expect(['PROTAGONIST', 'ANTAGONIST', 'SUPPORTING', 'MINOR']).toContain(c.role)
        }
      })

      it('aligns momentum + emotion timelines with the scene list', () => {
        const r = run(text)
        expect(r.momentumTimeline).toHaveLength(r.sceneCount)
        expect(r.emotionTimeline).toHaveLength(r.sceneCount)
      })

      it('keeps structure landmarks within the scene range', () => {
        const r = run(text)
        const n = r.sceneCount
        for (const beat of [r.structure.incitingIncidentScene, r.structure.midpointScene, r.structure.climaxScene]) {
          expect(beat).toBeGreaterThanOrEqual(-1)
          expect(beat).toBeLessThan(n)
        }
        for (const seg of r.structure.segments) {
          expect(STRUCTURE_PHASES.has(seg.phase)).toBe(true)
        }
      })

      it('sources every scene paragraph verbatim from the original', () => {
        const original = transformOriginal(text)
        const originals = new Set(original.paragraphs.map((p) => p.text))
        const r = transformCinematified(text, original.paragraphs)
        for (const s of r.scenes) for (const p of s.paragraphs) expect(originals.has(p.text)).toBe(true)
      })

      it('maps arcs with valid types', () => {
        const r = run(text)
        for (const arc of r.arcs) {
          expect(['INCITING', 'RISING', 'CLIMAX', 'FALLING', 'RESOLUTION']).toContain(arc.arcType)
          expect(arc.intensity).toBeGreaterThanOrEqual(0)
          expect(arc.intensity).toBeLessThanOrEqual(100)
        }
      })
    })
  }
})

describe('[integration] engine — specific fixture expectations', () => {
  it('detects both protagonists in a dual-lead story', () => {
    const r = run(ALL_FIXTURES.MULTI_PROTAGONIST)
    const names = r.characters.map((c) => c.name)
    expect(names).toContain('Elena')
    expect(names).toContain('Marcus')
  })

  it('detects the hero and at least one antagonist in a siege', () => {
    const r = run(ALL_FIXTURES.MULTI_ANTAGONIST)
    expect(r.characters.some((c) => c.name === 'Kael')).toBe(true)
    expect(r.intelligence.antagonistId).not.toBeNull()
  })

  it('segments a chaptered novel into multiple scenes', () => {
    const r = run(ALL_FIXTURES.CHAPTERED)
    expect(r.sceneCount).toBeGreaterThanOrEqual(5)
  })
})
