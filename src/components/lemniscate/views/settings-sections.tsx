'use client'

/**
 * Lemniscate — Settings sections
 * ----------------------------------------------------------------------------
 * The individual settings cards: appearance (theme), reading preferences,
 * accessibility, privacy, and about. Each reads the store slices it needs and
 * was extracted verbatim from `settings.tsx`; behavior is unchanged.
 */

import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  useLemniscate,
  type FontSize,
  type LineHeight,
  type FontFamily,
  type ReaderWidth,
} from '../store'
import { revealUp } from '@/lib/motion'
import { useTheme } from 'next-themes'
import {
  Moon,
  Sun,
  Type,
  Shield,
  Accessibility,
  Sparkles,
  Check,
  AlignJustify,
  Baseline,
  Columns,
} from 'lucide-react'
import { Segmented, Toggle, type SegmentedOption } from './settings-controls'

// ─── Appearance ───────────────────────────────────────────────────────────────

export function AppearanceCard() {
  const { theme, setTheme } = useTheme()
  const setReaderTheme = useLemniscate((s) => s.setReaderTheme)

  const applyTheme = (next: 'dark' | 'light') => {
    setTheme(next)
    setReaderTheme(next)
  }

  return (
    <motion.div variants={revealUp}>
      <Card className="border-amber/12 surface-raised">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-serif text-base text-ivory">
            <Sun className="h-4 w-4 text-amber" /> Appearance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-ivory">Theme</p>
              <p className="text-xs text-slate">Dark feels cinematic; light is a warm paper reading mode</p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={theme === 'dark' ? 'default' : 'outline'}
                onClick={() => applyTheme('dark')}
                className={`gap-1.5 ${theme === 'dark' ? 'bg-amber/15 text-amber' : 'border-amber/20 text-slate'}`}
              >
                <Moon className="h-3.5 w-3.5" /> Dark
              </Button>
              <Button
                size="sm"
                variant={theme === 'light' ? 'default' : 'outline'}
                onClick={() => applyTheme('light')}
                className={`gap-1.5 ${theme === 'light' ? 'bg-amber/15 text-amber' : 'border-amber/20 text-slate'}`}
              >
                <Sun className="h-3.5 w-3.5" /> Light
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── Reading preferences ──────────────────────────────────────────────────────

export function ReadingPreferencesCard() {
  const readerFontSize = useLemniscate((s) => s.readerFontSize)
  const setReaderFontSize = useLemniscate((s) => s.setReaderFontSize)
  const readerLineHeight = useLemniscate((s) => s.readerLineHeight)
  const setReaderLineHeight = useLemniscate((s) => s.setReaderLineHeight)
  const readerFontFamily = useLemniscate((s) => s.readerFontFamily)
  const setReaderFontFamily = useLemniscate((s) => s.setReaderFontFamily)
  const readerWidth = useLemniscate((s) => s.readerWidth)
  const setReaderWidth = useLemniscate((s) => s.setReaderWidth)

  const fontSizes: ReadonlyArray<SegmentedOption<FontSize>> = [
    { key: 'sm', label: 'Small', preview: <span className="font-serif" style={{ fontSize: '0.95rem' }}>Aa</span> },
    { key: 'md', label: 'Medium', preview: <span className="font-serif" style={{ fontSize: '1.125rem' }}>Aa</span> },
    { key: 'lg', label: 'Large', preview: <span className="font-serif" style={{ fontSize: '1.25rem' }}>Aa</span> },
    { key: 'xl', label: 'X-Large', preview: <span className="font-serif" style={{ fontSize: '1.4rem' }}>Aa</span> },
  ]

  const lineHeights: ReadonlyArray<SegmentedOption<LineHeight>> = [
    { key: 'compact', label: 'Compact' },
    { key: 'normal', label: 'Normal' },
    { key: 'relaxed', label: 'Relaxed' },
  ]

  const fontFamilies: ReadonlyArray<SegmentedOption<FontFamily>> = [
    { key: 'serif', label: 'Serif', preview: <span style={{ fontFamily: 'var(--font-reader)', fontSize: '1.1rem' }}>Ag</span> },
    { key: 'sans', label: 'Sans', preview: <span style={{ fontFamily: 'var(--font-sans-stack)', fontSize: '1.1rem' }}>Ag</span> },
  ]

  const readerWidths: ReadonlyArray<SegmentedOption<ReaderWidth>> = [
    { key: 'narrow', label: 'Narrow' },
    { key: 'medium', label: 'Medium' },
    { key: 'wide', label: 'Wide' },
  ]

  return (
    <motion.div variants={revealUp}>
      <Card className="border-amber/12 surface-raised">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-serif text-base text-ivory">
            <Type className="h-4 w-4 text-amber" /> Reading Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-sm text-ivory">
              <Baseline className="h-3.5 w-3.5 text-amber/70" /> Font size
            </p>
            <p className="mb-3 text-xs text-slate">Adjust the reading text size for comfort</p>
            <Segmented options={fontSizes} value={readerFontSize} onChange={setReaderFontSize} ariaLabel="Font size" columns={4} />
          </div>

          <Separator className="bg-amber/8" />

          <div>
            <p className="mb-1 flex items-center gap-1.5 text-sm text-ivory">
              <AlignJustify className="h-3.5 w-3.5 text-amber/70" /> Line height
            </p>
            <p className="mb-3 text-xs text-slate">Space between lines of text</p>
            <Segmented options={lineHeights} value={readerLineHeight} onChange={setReaderLineHeight} ariaLabel="Line height" />
          </div>

          <Separator className="bg-amber/8" />

          <div>
            <p className="mb-1 flex items-center gap-1.5 text-sm text-ivory">
              <Type className="h-3.5 w-3.5 text-amber/70" /> Font family
            </p>
            <p className="mb-3 text-xs text-slate">Serif for classic reading, sans for a modern look</p>
            <Segmented options={fontFamilies} value={readerFontFamily} onChange={setReaderFontFamily} ariaLabel="Font family" columns={2} />
          </div>

          <Separator className="bg-amber/8" />

          <div>
            <p className="mb-1 flex items-center gap-1.5 text-sm text-ivory">
              <Columns className="h-3.5 w-3.5 text-amber/70" /> Reader width
            </p>
            <p className="mb-3 text-xs text-slate">Width of the reading column</p>
            <Segmented options={readerWidths} value={readerWidth} onChange={setReaderWidth} ariaLabel="Reader width" />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── Accessibility ──────────────────────────────────────────────────────────

export function AccessibilityCard() {
  const reducedMotion = useLemniscate((s) => s.reducedMotion)
  const setReducedMotion = useLemniscate((s) => s.setReducedMotion)

  return (
    <motion.div variants={revealUp}>
      <Card className="border-amber/12 surface-raised">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-serif text-base text-ivory">
            <Accessibility className="h-4 w-4 text-amber" /> Accessibility
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-ivory">Reduced motion</p>
              <p className="text-xs text-slate">Minimize animations and transitions across the app</p>
            </div>
            <Toggle checked={reducedMotion} onChange={setReducedMotion} label="Reduced motion" />
          </div>
          <Separator className="bg-amber/8" />
          <div className="flex items-start gap-3 rounded-lg bg-calm/5 p-3">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-calm" />
            <div>
              <p className="text-sm text-ivory">Keyboard &amp; screen reader support</p>
              <p className="text-xs text-slate">
                Full keyboard navigation, focus management, and ARIA labels are built in. The
                reader supports arrow-key scene navigation, Cmd/Ctrl+K search, and Esc to exit.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── Privacy ──────────────────────────────────────────────────────────────────

export function PrivacyCard() {
  return (
    <motion.div variants={revealUp}>
      <Card className="border-amber/12 surface-raised">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-serif text-base text-ivory">
            <Shield className="h-4 w-4 text-amber" /> Privacy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg bg-calm/5 p-3">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-calm" />
            <div>
              <p className="text-sm text-ivory">All processing is local</p>
              <p className="text-xs text-slate">Documents never leave your device. No AI APIs, no cloud calls.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg bg-calm/5 p-3">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-calm" />
            <div>
              <p className="text-sm text-ivory">You own your content</p>
              <p className="text-xs text-slate">Delete any document and all its artifacts at any time.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg bg-calm/5 p-3">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-calm" />
            <div>
              <p className="text-sm text-ivory">No telemetry</p>
              <p className="text-xs text-slate">Zero analytics, zero tracking, zero data collection.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── About ────────────────────────────────────────────────────────────────────

export function AboutCard() {
  return (
    <motion.div variants={revealUp}>
      <Card className="border-amber/12 surface-raised">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-serif text-base text-ivory">
            <Sparkles className="h-4 w-4 text-amber" /> About Lemniscate
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate">
          <p>An advanced document-to-storytelling platform. Transform PDF, DOCX, and TXT files into structured cinematic narratives through deterministic, offline, classical-NLP processing.</p>
          <p className="text-xs">Version 1.0 · Built with Next.js, Prisma, Framer Motion · No LLMs, no AI APIs — ever.</p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
