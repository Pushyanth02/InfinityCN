import { describe, it, expect } from 'vitest'
import { detectDocumentType } from '@/lib/canonical/detect-type'

describe('detectDocumentType', () => {
  it('returns GENERAL for empty text', () => {
    expect(detectDocumentType('')).toBe('GENERAL')
  })

  it('detects RESEARCH_PAPER', () => {
    const text = 'Abstract\nMethodology\nReferences\nResults and discussion\nKeywords: test\nDOI: 10.1/test'
    expect(detectDocumentType(text)).toBe('RESEARCH_PAPER')
  })

  it('detects LEGAL_DOCUMENT', () => {
    const text = 'WHEREAS the party hereby agrees.\nSection 1. Jurisdiction herein.\nNotwithstanding the aforementioned statute.'
    expect(detectDocumentType(text)).toBe('LEGAL_DOCUMENT')
  })

  it('detects TECHNICAL_DOC', () => {
    const text = 'API Configuration\nStep 1: Installation\nPrerequisites: Version 2.0\nSystem requirements for troubleshooting'
    expect(detectDocumentType(text)).toBe('TECHNICAL_DOC')
  })

  it('is deterministic', () => {
    const text = 'Abstract. Methodology. References. Results and discussion. Keywords: test. DOI: 10.1/test.'
    expect(detectDocumentType(text)).toBe(detectDocumentType(text))
  })

  it('requires 2+ signals', () => {
    expect(detectDocumentType('This paper has an abstract.')).toBe('GENERAL')
  })
})
