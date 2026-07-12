'use client'

/**
 * Lemniscate — Library state components
 * ----------------------------------------------------------------------------
 * Small presentational pieces for the library view: the stats strip, the
 * empty-library call-to-action, and the initial-load skeleton grid. Extracted
 * verbatim from `library.tsx`; behavior is unchanged.
 */

import { motion } from 'framer-motion'
import {
  FileText,
  BookOpen,
  Clapperboard,
  Users,
  Loader2,
  Upload,
  Sparkles,
} from 'lucide-react'

import { InfinityFlow, Flourish } from '../logo'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  staggerContainer,
  revealScale,
  revealFade,
  revealUp,
} from '@/lib/motion'
import type { StatsResponse } from './library-types'

// ─── Stats strip ────────────────────────────────────────────────────────────

export function StatsStrip({ stats }: { stats: StatsResponse | null }) {
  const items = [
    { icon: FileText, label: 'Documents', value: stats?.counts.documents ?? 0 },
    { icon: BookOpen, label: 'Narratives', value: stats?.counts.narratives ?? 0 },
    { icon: Clapperboard, label: 'Scenes', value: stats?.counts.scenes ?? 0 },
    { icon: Users, label: 'Characters', value: stats?.counts.characters ?? 0 },
  ]
  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      {items.map((it) => {
        const Icon = it.icon
        return (
          <motion.div key={it.label} variants={revealScale}>
            <Card className="surface-raised group relative overflow-hidden rounded-xl border-amber/10 p-4 transition-colors hover:border-amber/25">
              <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-amber/5 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" aria-hidden />
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber/20 bg-amber/10 text-amber">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 leading-tight">
                  <div className="font-serif text-2xl font-medium tabular-nums text-ivory">
                    {it.value}
                  </div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                    {it.label}
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        )
      })}
    </motion.div>
  )
}

// ─── Empty state ────────────────────────────────────────────────────────────

export function EmptyState({
  onUpload,
  onSample,
  uploading,
}: {
  onUpload: () => void
  onSample: () => void
  uploading: boolean
}) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="flex flex-col items-center justify-center px-6 py-20 text-center"
    >
      <motion.div variants={revealFade} className="relative mb-8">
        <div
          className="pointer-events-none absolute inset-0 -m-12 rounded-full bg-amber/10 blur-3xl"
          aria-hidden
        />
        <InfinityFlow className="relative h-24 w-48 text-amber" />
      </motion.div>

      <motion.h3
        variants={revealUp}
        className="text-headline text-ivory"
      >
        Your library is empty
      </motion.h3>

      <motion.p
        variants={revealUp}
        className="mt-3 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground"
      >
        Upload a document to reconstruct it into a living narrative — or try the
        sample story and watch Lemniscate transform prose into cinema.
      </motion.p>

      <motion.div
        variants={revealUp}
        className="mt-8 flex flex-col items-center gap-3 sm:flex-row"
      >
        <Button
          onClick={onUpload}
          disabled={uploading}
          size="lg"
          className="gap-2 bg-linear-to-br from-amber to-amber/80 text-midnight shadow-glow-amber hover:from-amber/90 hover:to-amber/70"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Upload a document
        </Button>
        <Button
          onClick={onSample}
          disabled={uploading}
          variant="outline"
          size="lg"
          className="gap-2 border-amber/30 bg-transparent text-amber hover:border-amber/50 hover:bg-amber/5"
        >
          <Sparkles className="h-4 w-4" />
          Try the sample story
        </Button>
      </motion.div>

      <motion.div variants={revealFade} className="mt-10">
        <Flourish className="h-3 w-32 text-amber/30" />
      </motion.div>
    </motion.div>
  )
}

// ─── Skeleton grid (initial loading) ────────────────────────────────────────

export function SkeletonGrid() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading library"
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {/* Visually-hidden status text for screen readers; the pulsing cards
          below are decorative. */}
      <span className="sr-only">Loading your library…</span>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          aria-hidden
          className="surface-raised overflow-hidden rounded-xl border-amber/10"
        >
          <div
            className="h-44 w-full animate-pulse"
            style={{
              background:
                'linear-gradient(135deg, oklch(0.2 0.02 270) 0%, oklch(0.16 0.02 270) 100%)',
            }}
          />
          <div className="space-y-2.5 p-4">
            <div className="h-3 w-2/3 animate-pulse rounded bg-midnight/60" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-midnight/40" />
            <div className="h-2.5 w-1/3 animate-pulse rounded bg-midnight/40" />
          </div>
        </div>
      ))}
    </div>
  )
}
