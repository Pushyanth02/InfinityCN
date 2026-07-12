'use client'

/**
 * Lemniscate — ORIGINAL mode reader
 * ----------------------------------------------------------------------------
 * Faithful, beautifully typeset long-form prose. Each paragraph reveals on
 * scroll via `ParagraphBlock`; `OriginalReader` composes the title block, the
 * paragraph stream, and the closing flourish. Extracted verbatim from
 * `reader.tsx`; behavior is unchanged.
 */

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'

import { type FontSize } from '../store'
import { Flourish } from '../logo'
import { revealBlur, staggerContainer } from '@/lib/motion'
import { FONT_SIZE_REM, useReaderTypography } from './reader-shared'
import type { ReaderParagraph, ReaderNarrative } from './reader-types'

// ─── Paragraph rendering (ORIGINAL mode) ─────────────────────────────────────

function ParagraphBlock({ p }: { p: ReaderParagraph }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px -10% 0px' })

  const content = (() => {
    switch (p.type) {
      case 'HEADING':
        return <h2>{p.text}</h2>
      case 'DIALOGUE':
        return (
          <blockquote>
            {p.speaker && (
              <span className="mb-1 block font-sans text-[11px] uppercase not-italic tracking-[0.2em] text-amber/60">
                {p.speaker}
              </span>
            )}
            {p.text}
          </blockquote>
        )
      case 'TRANSITION':
        return (
          <p className="text-center italic text-slate/80">{p.text}</p>
        )
      case 'THOUGHT':
        return <p className="italic text-slate/85">{p.text}</p>
      case 'ACTION':
        return <p style={{ marginBottom: '1.2em' }}>{p.text}</p>
      case 'NARRATION':
      default:
        return <p>{p.text}</p>
    }
  })()

  return (
    <motion.div
      ref={ref}
      variants={revealBlur}
      initial="initial"
      animate={inView ? 'animate' : 'initial'}
      data-paragraph-id={p.id}
      data-paragraph-idx={p.index}
    >
      {content}
    </motion.div>
  )
}

// ─── ORIGINAL mode reader ────────────────────────────────────────────────────

export function OriginalReader({
  narrative,
  fontSize,
}: {
  narrative: ReaderNarrative
  fontSize: FontSize
}) {
  const { lineHeight, fontFamily, maxWidth } = useReaderTypography()
  return (
    <motion.article
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="reader-canvas"
      style={{ fontSize: FONT_SIZE_REM[fontSize], lineHeight, fontFamily, maxWidth }}
    >
      {/* Title block */}
      <motion.header
        variants={revealBlur}
        className="mb-12 text-center"
      >
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.3em] text-amber/60">
          Original Mode
        </p>
        <h1 className="text-display text-amber-gradient">{narrative.title}</h1>
        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-slate">
          <span>{narrative.wordCount.toLocaleString()} words</span>
          <span className="text-amber/30">·</span>
          <span>{narrative.readingTimeMin} min read</span>
          <span className="text-amber/30">·</span>
          <span>{narrative.paragraphs.length} paragraphs</span>
        </div>
        <div className="mt-6 flex justify-center">
          <Flourish className="h-3 w-32 text-amber/40" />
        </div>
      </motion.header>

      {narrative.paragraphs.map((p) => (
        <ParagraphBlock key={p.id} p={p} />
      ))}

      <motion.div
        variants={revealBlur}
        className="mt-16 flex flex-col items-center gap-3 text-center"
      >
        <Flourish className="h-3 w-40 text-amber/30" />
        <p className="font-serif text-sm italic text-slate">The End</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-amber/40">
          Lemniscate · {narrative.wordCount.toLocaleString()} words
        </p>
      </motion.div>
    </motion.article>
  )
}
