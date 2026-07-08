import { describe, it, expect } from 'vitest'
import { transformOriginal } from './original'
import { transformCinematified } from './cinematified'

const ARC_TYPES = new Set(['INCITING', 'RISING', 'CLIMAX', 'FALLING', 'RESOLUTION'])
const CHAR_ROLES = new Set(['PROTAGONIST', 'ANTAGONIST', 'SUPPORTING', 'MINOR'])

const STORY = [
  'The Tower',
  'Chapter One',
  'Elara stood at the window of the lighthouse. The sea was calm and grey.',
  '"You should not be here," Marin said.',
  'Elara turned to face him. "The sea is warning us," Elara replied.',
  'Chapter Two',
  'Later, they reached the harbor. A ship struck the rocks and burst into flame. Marin shouted a warning to the crew.',
  'Corin climbed from the cold water. "I have come to warn you," Corin said.',
].join('\n\n')

/** Build the cinematified result the same way the orchestrator does. */
function cinematify(text: string) {
  const original = transformOriginal(text)
  return {
    original,
    cinema: transformCinematified(text, original.paragraphs),
  }
}

describe('[unit] transformCinematified — scene segmentation', () => {
  it('segments the narrative into multiple scenes at headings/transitions', () => {
    const { cinema } = cinematify(STORY)
    expect(cinema.sceneCount).toBeGreaterThanOrEqual(2)
    expect(cinema.scenes.length).toBe(cinema.sceneCount)
  })

  it('infers the title from the leading heading', () => {
    const { cinema } = cinematify(STORY)
    expect(cinema.title).toBe('The Tower')
  })
})

describe('[unit] transformCinematified — character detection', () => {
  it('detects the named characters via attribution and repetition', () => {
    const { cinema } = cinematify(STORY)
    const names = cinema.characters.map((c) => c.name)
    expect(names).toContain('Elara')
    expect(names).toContain('Marin')
    expect(names).toContain('Corin')
  })

  it('assigns a valid role to every character', () => {
    const { cinema } = cinematify(STORY)
    for (const c of cinema.characters) {
      expect(CHAR_ROLES.has(c.role)).toBe(true)
    }
  })

  it('never invents a character absent from the source text', () => {
    const { cinema } = cinematify(STORY)
    for (const c of cinema.characters) {
      expect(STORY).toContain(c.name)
    }
  })
})

describe('[unit] transformCinematified — verbatim constraint', () => {
  it('sources every scene paragraph verbatim from the ORIGINAL paragraphs', () => {
    const { original, cinema } = cinematify(STORY)
    const originalTexts = new Set(original.paragraphs.map((p) => p.text))
    for (const scene of cinema.scenes) {
      for (const p of scene.paragraphs) {
        expect(originalTexts.has(p.text)).toBe(true)
      }
    }
  })

  it('derives every event description verbatim from its scene text', () => {
    const { cinema } = cinematify(STORY)
    for (const event of cinema.events) {
      const scene = cinema.scenes[event.sceneIndex]
      const sceneText = scene.paragraphs.map((p) => p.text).join(' ')
      expect(sceneText).toContain(event.description)
    }
  })
})

describe('[unit] transformCinematified — arcs & scoring', () => {
  it('maps arcs with valid arc types', () => {
    const { cinema } = cinematify(STORY)
    expect(cinema.arcs.length).toBeGreaterThanOrEqual(1)
    for (const arc of cinema.arcs) {
      expect(ARC_TYPES.has(arc.arcType)).toBe(true)
    }
  })

  it('scores scenes within bounded ranges', () => {
    const { cinema } = cinematify(STORY)
    for (const s of cinema.scenes) {
      expect(s.tensionScore).toBeGreaterThanOrEqual(0)
      expect(s.tensionScore).toBeLessThanOrEqual(100)
      expect(s.emotionScore).toBeGreaterThanOrEqual(0)
      expect(s.emotionScore).toBeLessThanOrEqual(100)
      expect(s.dialogueRatio).toBeGreaterThanOrEqual(0)
      expect(s.dialogueRatio).toBeLessThanOrEqual(1)
    }
  })
})

describe('[unit] transformCinematified — determinism', () => {
  it('produces byte-identical output for identical input', () => {
    const a = cinematify(STORY).cinema
    const b = cinematify(STORY).cinema
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('handles an empty paragraph set without throwing', () => {
    const cinema = transformCinematified('', [])
    expect(cinema.sceneCount).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(cinema.characters)).toBe(true)
  })
})
