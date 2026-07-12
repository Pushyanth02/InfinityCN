'use client'

/**
 * Lemniscate — Library book card
 * ----------------------------------------------------------------------------
 * A single document tile: deterministic cover art, file-type badge, delete
 * affordance, live processing progress (via the realtime store), status badge,
 * metadata, and hover action hints. Extracted verbatim from `library.tsx`;
 * behavior is unchanged.
 */

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  BookOpen,
  HardDrive,
} from 'lucide-react'

import { useLemniscate } from '../store'
import { InfinityMark } from '../logo'
import { Card } from '@/components/ui/card'
import { spring, revealScale } from '@/lib/motion'
import {
  coverFromHash,
  getFileType,
  stripExt,
  STAGE_LABEL,
  formatSize,
  formatDate,
  estimateWords,
  isProcessingJob,
  isCompletedDoc,
} from './library-shared'
import type { LibraryDocument } from './library-types'

// ─── Book card ──────────────────────────────────────────────────────────────

export function BookCard({
  doc,
  onOpen,
  onDelete,
}: {
  doc: LibraryDocument
  onOpen: (doc: LibraryDocument) => void
  onDelete: (doc: LibraryDocument) => void
}) {
  const latestJob = doc.jobs[0]
  const processing = isProcessingJob(latestJob)
  const completed = isCompletedDoc(doc)
  const failed = latestJob?.status === 'FAILED' || doc.status === 'FAILED'

  // Live progress from realtime store (falls back to job snapshot)
  const liveProgress = useLemniscate((s) =>
    latestJob ? s.progress[latestJob.id]?.progress ?? latestJob.progress ?? 0 : 0,
  )
  const liveStage = useLemniscate((s) =>
    latestJob ? s.progress[latestJob.id]?.stage ?? latestJob.stage ?? 'QUEUED' : 'QUEUED',
  )

  const cover = React.useMemo(() => coverFromHash(doc.fileHash), [doc.fileHash])
  const { label: typeLabel, tint: typeTint } = getFileType(doc.originalName)
  // Prefer the deterministically detected title; fall back to the filename.
  const title = (doc.title && doc.title.trim()) || stripExt(doc.originalName)
  const stageLabel = STAGE_LABEL[liveStage] ?? liveStage

  const statusBadge = processing ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber/40 bg-midnight/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber backdrop-blur-sm">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber" />
      </span>
      Processing
    </span>
  ) : failed ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-burgundy/50 bg-midnight/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-burgundy backdrop-blur-sm">
      <AlertCircle className="h-3 w-3" />
      Failed
    </span>
  ) : completed ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-calm/40 bg-midnight/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-calm backdrop-blur-sm">
      <CheckCircle2 className="h-3 w-3" />
      Completed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate/40 bg-midnight/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate backdrop-blur-sm">
      <Clock className="h-3 w-3" />
      {doc.status}
    </span>
  )

  return (
    <motion.div
      layout
      variants={revealScale}
      initial="initial"
      animate="animate"
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      whileHover={{ y: -6, transition: spring.snappy }}
      className="group relative"
    >
      <Card
        className="surface-raised relative cursor-pointer overflow-hidden rounded-xl border-amber/10 p-0 transition-shadow duration-300 hover:border-amber/30 hover:shadow-cinema"
        onClick={() => onOpen(doc)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen(doc)
          }
        }}
        tabIndex={0}
        role="button"
        aria-label={`Open ${title}`}
      >
        {/* ─── Cover ─── */}
        <div
          className="relative h-44 w-full overflow-hidden"
          style={{ background: cover.background }}
        >
          {/* Layered radial accent for depth */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(circle at ${cover.glowX}% ${cover.glowY}%, oklch(1 0 0 / 0.18), transparent 55%)`,
            }}
            aria-hidden
          />
          {/* Subtle vignette */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 120%, oklch(0 0 0 / 0.45), transparent 60%)',
            }}
            aria-hidden
          />

          {/* File type badge — top left */}
          <span
            className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md border border-ivory/20 bg-midnight/60 px-2 py-1 font-mono text-[10px] font-bold tracking-wider text-ivory backdrop-blur-sm"
            style={{ boxShadow: `inset 0 0 0 1px ${typeTint}33` }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: typeTint }}
            />
            {typeLabel}
          </span>

          {/* Delete button — top right, appears on hover */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(doc)
            }}
            aria-label={`Delete ${title}`}
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md border border-ivory/15 bg-midnight/60 text-ivory/70 opacity-0 backdrop-blur-sm transition-all hover:border-burgundy/60 hover:bg-burgundy/20 hover:text-burgundy focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          {/* Infinity watermark — bottom right */}
          <div
            className="pointer-events-none absolute bottom-3 right-3 text-ivory/25"
            style={{ transform: `rotate(${cover.motifRotation}deg)` }}
            aria-hidden
          >
            <InfinityMark className="h-9 w-9" animated={false} />
          </div>

          {/* Title overlay on cover bottom-left */}
          <div className="absolute bottom-3 left-3 right-16">
            <h3 className="line-clamp-2 font-serif text-base font-medium leading-tight text-ivory drop-shadow-[0_2px_8px_oklch(0_0_0/0.6)]">
              {title}
            </h3>
            {doc.author && (
              <p className="mt-0.5 line-clamp-1 text-[11px] font-medium text-ivory/75 drop-shadow-[0_2px_6px_oklch(0_0_0/0.6)]">
                by {doc.author}
              </p>
            )}
          </div>

          {/* Status badge — top center-right, below delete when hovered */}
          <div className="absolute right-3 top-12 transition-transform group-hover:-translate-y-0.5">
            {statusBadge}
          </div>
        </div>

        {/* ─── Body ─── */}
        <div className="space-y-3 p-4">
          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <BookOpen className="h-3 w-3 text-amber/60" />
              {doc._count.narratives} narrative{doc._count.narratives === 1 ? '' : 's'}
            </span>
            <span className="text-amber/25">·</span>
            <span className="inline-flex items-center gap-1">
              <HardDrive className="h-3 w-3 text-amber/60" />
              {formatSize(doc.sizeBytes)}
            </span>
            <span className="text-amber/25">·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3 text-amber/60" />
              {formatDate(doc.createdAt)}
            </span>
          </div>

          {/* Word count — real (detected) when available, else estimated */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground/80">
            {doc.wordCount != null ? (
              <span>{doc.wordCount.toLocaleString()} words</span>
            ) : (
              <span>
                <span className="font-mono text-amber/50">≈</span>{' '}
                {estimateWords(doc.sizeBytes, doc.mimeType)}
              </span>
            )}
            {doc.readingTimeMin != null && doc.readingTimeMin > 0 && (
              <>
                <span className="text-amber/25">·</span>
                <span>{doc.readingTimeMin} min read</span>
              </>
            )}
            {doc.series && (
              <>
                <span className="text-amber/25">·</span>
                <span className="line-clamp-1 italic text-amber/60">{doc.series}</span>
              </>
            )}
          </div>

          {/* Progress bar (if processing) */}
          <AnimatePresence>
            {processing && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="space-y-1.5"
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-medium uppercase tracking-wider text-amber/90">
                    {stageLabel}
                  </span>
                  <span className="font-mono tabular-nums text-amber">
                    {Math.round(liveProgress)}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-midnight">
                  <motion.div
                    className="h-full rounded-full bg-linear-to-r from-amber via-amber to-burgundy"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(2, Math.min(100, liveProgress))}%` }}
                    transition={spring.snappy}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hover action hint */}
          <AnimatePresence>
            {completed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-between border-t border-amber/10 pt-2.5"
              >
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber/80">
                  <Eye className="h-3.5 w-3.5" />
                  Read narrative
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-amber">
                  Open →
                </span>
              </motion.div>
            )}
            {processing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-between border-t border-amber/10 pt-2.5"
              >
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber/80">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Watch progress
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-amber">
                  Open →
                </span>
              </motion.div>
            )}
            {failed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-between border-t border-burgundy/20 pt-2.5"
              >
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-burgundy">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Processing failed
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </motion.div>
  )
}
