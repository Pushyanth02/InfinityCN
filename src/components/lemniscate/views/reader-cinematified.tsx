'use client'

/**
 * Lemniscate — CINEMATIFIED mode reader
 * ----------------------------------------------------------------------------
 * The cinematic screenplay experience: scene cards with headings, summaries,
 * type-specific paragraph styling, in-scene character-name highlighting, and
 * active-scene tracking for the explorer/nav. Extracted verbatim from
 * `reader.tsx`; behavior is unchanged.
 */

import * as React from 'react'
import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Film, Users } from 'lucide-react'

import { type FontSize } from '../store'
import { Flourish } from '../logo'
import { bookOpen, sceneTransition, revealBlur, staggerFast } from '@/lib/motion'
import { FONT_SIZE_REM, useReaderTypography, buildSceneHeading } from './reader-shared'
import { cn } from '@/lib/utils'
import type {
  ReaderScene,
  ReaderLocation,
  ReaderCharacter,
  ReaderNarrative,
} from './reader-types'

// ─── Scene metadata rail + character highlighting (Cinematified v2) ──────────

/**
 * Wrap verbatim paragraph text, highlighting known character names. The text
 * bytes are never modified — only split into React fragments around matches.
 */
function HighlightedText({
  text,
  forms,
}: {
  text: string
  forms: Array<{ form: string; character: ReaderCharacter }>
}) {
  if (forms.length === 0) return <>{text}</>
  return <>{highlightCharacters(text, forms)}</>
}

/**
 * Highlight known character names inside a verbatim paragraph. Splits the text
 * on matches and wraps each in a <mark>; the original bytes are never altered —
 * only split into React fragments. Longest forms win (claimed-span technique).
 */
function highlightCharacters(
  text: string,
  forms: Array<{ form: string; character: ReaderCharacter }>,
): React.ReactNode[] {
  if (forms.length === 0 || !text) return [text]
  const sorted = [...forms].sort((a, b) => b.form.length - a.form.length)
  const claimed: Array<[number, number]> = []
  const hits: Array<{ start: number; end: number; character: ReaderCharacter }> = []
  for (const { form, character } of sorted) {
    const re = new RegExp(
      `${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}`,
      'g',
    )
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(text)) !== null) {
      const start = m.index
      const end = start + m[0].length
      if (claimed.some(([s, e]) => start >= s && end <= e)) continue
      claimed.push([start, end])
      hits.push({ start, end, character })
    }
  }
  if (hits.length === 0) return [text]
  hits.sort((a, b) => a.start - b.start)
  const out: React.ReactNode[] = []
  let cursor = 0
  for (const h of hits) {
    if (h.start > cursor) out.push(text.slice(cursor, h.start))
    const roleColor = h.character.role === 'PROTAGONIST'
      ? 'var(--amber)'
      : h.character.role === 'ANTAGONIST'
        ? 'var(--tension)'
        : 'var(--ivory)'
    out.push(
      <mark
        key={`${h.start}-${h.character.id}`}
        className="reader-char"
        style={{ textDecorationColor: roleColor }}
        title={`${h.character.name} · ${h.character.role} · ${h.character.mentions} mentions`}
      >
        {text.slice(h.start, h.end)}
      </mark>,
    )
    cursor = h.end
  }
  if (cursor < text.length) out.push(text.slice(cursor))
  return out
}

// ─── Scene cinematic rendering (CINEMATIFIED mode) ───────────────────────────

interface SceneCinematicProps {
  scene: ReaderScene
  locations: ReaderLocation[]
  fontSize: FontSize
  characters: ReaderCharacter[]
  highlightChars: boolean
  onSceneInView: (index: number) => void
  registerRef: (index: number, el: HTMLElement | null) => void
}

function SceneCinematic({
  scene,
  locations,
  fontSize,
  characters,
  highlightChars,
  onSceneInView,
  registerRef,
}: SceneCinematicProps) {
  const ref = useRef<HTMLElement>(null)
  // Active-scene tracking: fires when this scene crosses the middle of the viewport.
  const inView = useInView(ref, { margin: '-40% 0px -40% 0px' })
  // Reveal-once: the scene animates in the first time it scrolls into view.
  const inViewOnce = useInView(ref, { once: true, margin: '-10% 0px -10% 0px' })

  // Character surface forms (original-case name + aliases) for the characters
  // that participate in THIS scene. Scoping keeps the highlighter fast on large
  // casts. `form` keeps original casing so the verbatim text is matched exactly.
  const charForms = React.useMemo(() => {
    const forms: Array<{ form: string; character: ReaderCharacter }> = []
    if (!highlightChars) return forms
    const sceneStart = scene.startOffset
    const sceneEnd = scene.endOffset
    const smallCast = characters.length <= 40
    for (const c of characters) {
      const inScene =
        smallCast ||
        (sceneStart !== undefined &&
          sceneEnd !== undefined &&
          c.firstAppearanceOffset !== undefined &&
          c.lastAppearanceOffset !== undefined &&
          c.lastAppearanceOffset >= sceneStart &&
          c.firstAppearanceOffset <= sceneEnd)
      if (!inScene) continue
      forms.push({ form: c.name, character: c })
      // aliases is stored as a JSON string on the Character row; parse defensively.
      if (c.aliases) {
        try {
          const parsed = JSON.parse(c.aliases)
          if (Array.isArray(parsed)) {
            for (const a of parsed) {
              if (typeof a === 'string' && a.trim()) forms.push({ form: a, character: c })
            }
          }
        } catch {
          /* malformed aliases JSON — ignore */
        }
      }
    }
    return forms
  }, [characters, highlightChars, scene.startOffset, scene.endOffset])

  /** Render a paragraph's text, wrapping character-name matches in <mark>. */
  const renderText = React.useCallback(
    (text: string) => {
      if (!highlightChars || charForms.length === 0) return text
      return <HighlightedText text={text} forms={charForms} />
    },
    [highlightChars, charForms],
  )

  React.useEffect(() => {
    if (inView) onSceneInView(scene.index)
  }, [inView, scene.index, onSceneInView])

  React.useEffect(() => {
    registerRef(scene.index, ref.current)
    return () => registerRef(scene.index, null)
  }, [scene.index, registerRef])

  const heading = buildSceneHeading(scene, locations)
  const { lineHeight, fontFamily } = useReaderTypography()

  return (
    <motion.section
      ref={ref}
      variants={sceneTransition}
      initial="initial"
      animate={inViewOnce ? 'animate' : 'initial'}
      className="relative scroll-mt-24"
      data-scene-index={scene.index}
      data-scene-id={scene.id}
    >
      <div>
        {/* Scene heading — monospace, uppercase, centered, amber */}
        <motion.div
          variants={revealBlur}
          className="scene-heading"
        >
          {heading}
        </motion.div>

        {/* Scene title */}
        <motion.div
          variants={revealBlur}
          className="mb-8 mt-2 text-center"
        >
          <h3 className="text-title text-ivory">{scene.title}</h3>
        </motion.div>

        {/* Scene summary — italic, muted, gold left border */}
        {scene.summary && (
          <motion.blockquote
            variants={revealBlur}
            className="mx-auto mb-10 max-w-2xl border-l-2 border-amber/40 bg-plum/20 px-5 py-3 text-center italic text-slate"
          >
            {scene.summary}
          </motion.blockquote>
        )}

        {/* Paragraphs — type-specific cinematic styling */}
        <motion.div
          variants={staggerFast}
          className="reader-canvas space-y-1"
          style={{ fontSize: FONT_SIZE_REM[fontSize], lineHeight, fontFamily }}
        >
          {scene.paragraphs.length === 0 && (
            <p className="text-center italic text-slate/70">
              [No source text recovered for this scene.]
            </p>
          )}
          {scene.paragraphs.map((p) => {
            if (p.type === 'DIALOGUE') {
              return (
                <motion.div
                  key={p.id}
                  variants={revealBlur}
                  className="my-5 text-center"
                  data-paragraph-id={p.id}
                  data-paragraph-idx={p.index}
                >
                  {p.speaker && (
                    <p className="mb-1 font-mono text-xs uppercase tracking-[0.25em] text-amber/80">
                      {p.speaker}
                    </p>
                  )}
                  <p className="mx-auto max-w-xl italic text-ivory/90">
                    {p.text}
                  </p>
                </motion.div>
              )
            }
            if (p.type === 'HEADING') {
              return (
                <motion.p
                  key={p.id}
                  variants={revealBlur}
                  className="mt-6 text-center font-serif text-base text-amber"
                  data-paragraph-id={p.id}
                  data-paragraph-idx={p.index}
                >
                  {p.text}
                </motion.p>
              )
            }
            if (p.type === 'TRANSITION') {
              return (
                <motion.p
                  key={p.id}
                  variants={revealBlur}
                  className="my-4 text-center italic text-slate/70"
                  data-paragraph-id={p.id}
                  data-paragraph-idx={p.index}
                >
                  {p.text}
                </motion.p>
              )
            }
            if (p.type === 'THOUGHT') {
              return (
                <motion.p
                  key={p.id}
                  variants={revealBlur}
                  className="my-3 italic text-slate/85"
                  data-paragraph-id={p.id}
                  data-paragraph-idx={p.index}
                >
                  {renderText(p.text)}
                </motion.p>
              )
            }
            if (p.type === 'ACTION') {
              return (
                <motion.p
                  key={p.id}
                  variants={revealBlur}
                  className="my-3 pl-4 text-ivory/90"
                  data-paragraph-id={p.id}
                  data-paragraph-idx={p.index}
                >
                  {renderText(p.text)}
                </motion.p>
              )
            }
            // NARRATION
            return (
              <motion.p
                key={p.id}
                variants={revealBlur}
                className="my-3"
                data-paragraph-id={p.id}
                data-paragraph-idx={p.index}
              >
                {renderText(p.text)}
              </motion.p>
            )
          })}
        </motion.div>

      </div>
    </motion.section>
  )
}

// ─── Scene separator (between scenes) ────────────────────────────────────────

function SceneSeparator() {
  return (
    <div className="scene-separator" aria-hidden="true">
      <Flourish className="h-3 w-28 text-amber/40" />
    </div>
  )
}

// ─── CINEMATIFIED reader ─────────────────────────────────────────────────────

export function CinematifiedReader({
  narrative,
  fontSize,
  onSceneInView,
  registerRef,
}: {
  narrative: ReaderNarrative
  fontSize: FontSize
  onSceneInView: (i: number) => void
  registerRef: (i: number, el: HTMLElement | null) => void
}) {
  const { maxWidth } = useReaderTypography()
  // Inline character-highlighting toggle (off by default — many readers want
  // clean prose; the toggle surfaces the character intelligence on demand).
  const [highlightChars, setHighlightChars] = React.useState(true)
  return (
    <motion.article
      variants={bookOpen}
      initial="initial"
      animate="animate"
      className="mx-auto w-full px-4 pb-32 pt-8 sm:px-6"
      style={{ maxWidth }}
    >
      {/* Title block */}
      <motion.header variants={revealBlur} className="mb-16 text-center">
        <p className="mb-3 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.3em] text-amber/60">
          <Film className="h-3.5 w-3.5" />
          Cinematified
        </p>
        <h1 className="text-display text-amber-gradient">
          {narrative.title}
        </h1>
        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-slate">
          <span>{narrative.readingTimeMin} min read</span>
        </div>
        <div className="mt-6 flex justify-center">
          <Flourish className="h-3 w-40 text-amber/40" />
        </div>
      </motion.header>

      {/* Disclaimer */}
      <motion.p
        variants={revealBlur}
        className="mx-auto mb-16 max-w-xl text-center text-[11px] italic leading-relaxed text-slate/70"
      >
        Cinematified reconstruction — all narrative text is sourced verbatim
        from the original document. Structural annotations are generated by
        deterministic heuristics. No content was invented.
      </motion.p>

      {/* Character-highlight toggle */}
      {narrative.characters.length > 0 && (
        <div className="mb-10 flex justify-center">
          <button
            onClick={() => setHighlightChars((v) => !v)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors',
              highlightChars
                ? 'border-amber/40 bg-amber/10 text-amber'
                : 'border-amber/15 text-slate hover:bg-amber/5 hover:text-amber',
            )}
            aria-pressed={highlightChars}
          >
            <Users className="h-3.5 w-3.5" />
            {highlightChars ? 'Characters highlighted' : 'Highlight characters'}
            <span className="text-amber/50">· {narrative.characters.length}</span>
          </button>
        </div>
      )}

      {narrative.scenes.length === 0 && (
        <p className="text-center italic text-slate">
          No scenes were detected in this narrative.
        </p>
      )}

      {narrative.scenes.map((scene, i) => (
        <React.Fragment key={scene.id}>
          <SceneCinematic
            scene={scene}
            locations={narrative.locations}
            fontSize={fontSize}
            characters={narrative.characters}
            highlightChars={highlightChars}
            onSceneInView={onSceneInView}
            registerRef={registerRef}
          />
          {i < narrative.scenes.length - 1 && <SceneSeparator />}
        </React.Fragment>
      ))}

      {/* End card */}
      <motion.div
        variants={revealBlur}
        className="mt-24 flex flex-col items-center gap-3 text-center"
      >
        <Flourish className="h-3 w-48 text-amber/40" />
        <p className="font-serif text-base italic text-ivory">Fin.</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-amber/40">
          {narrative.scenes.length} Scenes · {narrative.wordCount.toLocaleString()} Words · Lemniscate
        </p>
      </motion.div>
    </motion.article>
  )
}
