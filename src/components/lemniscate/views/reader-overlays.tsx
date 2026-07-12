'use client'

/**
 * Lemniscate — Reader overlays
 * ----------------------------------------------------------------------------
 * Bookmarks popover (dropdown list + jump/delete) and the continue-reading
 * hint banner. Extracted from `reader.tsx` (Phase 4 decomposition) — behavior
 * unchanged.
 */
import * as React from 'react'
import { motion } from 'framer-motion'
import { Bookmark, Trash2, X, BookOpen } from 'lucide-react'
import { spring } from '@/lib/motion'
import { useFocusTrap } from '../hooks'
import type { ReaderBookmark, ReaderProgress } from './reader-types'

interface BookmarksPopoverProps {
  bookmarks: ReaderBookmark[]
  onJump: (bm: ReaderBookmark) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export function BookmarksPopover({
  bookmarks,
  onJump,
  onDelete,
  onClose,
}: BookmarksPopoverProps) {
  // Trap focus inside the popover while open and return it to the trigger on
  // close. This is a dropdown rather than a full modal, but the dialog role
  // implies the WAI-ARIA focus containment contract.
  const containerRef = useFocusTrap<HTMLDivElement>(true)
  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, scale: 0.95, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: -4 }}
      transition={spring.snappy}
      className="absolute right-0 top-full z-50 mt-2 w-80 origin-top-right rounded-xl border border-amber/20 bg-plum/95 shadow-cinema backdrop-blur-2xl"
      role="dialog"
      aria-label="Bookmarks"
    >
      <div className="flex items-center justify-between border-b border-amber/15 px-3 py-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber/60">
          Bookmarks · {bookmarks.length}
        </p>
        <button
          onClick={onClose}
          aria-label="Close bookmarks"
          className="text-slate transition-colors hover:text-amber"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto scrollbar-lemniscate p-1">
        {bookmarks.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <Bookmark className="mx-auto mb-2 h-6 w-6 text-amber/30" />
            <p className="text-xs text-slate">
              No bookmarks yet.
            </p>
            <p className="mt-1 text-[11px] text-slate/70">
              Click the bookmark icon in the top bar to save a position.
            </p>
          </div>
        ) : (
          bookmarks.map((bm) => (
            <div
              key={bm.id}
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-amber/10"
            >
              <Bookmark className="h-3.5 w-3.5 shrink-0 text-amber/70" />
              <button
                onClick={() => onJump(bm)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-xs font-medium text-ivory">
                  {bm.label ||
                    (bm.sceneIndex != null
                      ? `Scene ${bm.sceneIndex + 1}`
                      : 'Position')}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-wide text-amber/50">
                  {Math.round(bm.offset)}%
                  {bm.sceneIndex != null ? ` · Scene ${bm.sceneIndex + 1}` : ''}
                  {bm.note ? ` · ${bm.note.slice(0, 40)}` : ''}
                </p>
              </button>
              <button
                onClick={() => onDelete(bm.id)}
                aria-label="Delete bookmark"
                className="shrink-0 text-slate opacity-0 transition-all hover:text-tension group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </motion.div>
  )
}

interface ContinueReadingHintProps {
  progress: ReaderProgress
  onDismiss: () => void
  onStartOver: () => void
}

export function ContinueReadingHint({
  progress,
  onDismiss,
  onStartOver,
}: ContinueReadingHintProps) {
  React.useEffect(() => {
    const t = setTimeout(onDismiss, 7000)
    return () => clearTimeout(t)
  }, [onDismiss])
  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={spring.gentle}
      className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 px-4"
    >
      <div className="glass-strong flex items-center gap-3 rounded-full border border-amber/25 py-2 pl-4 pr-2 shadow-cinema">
        <BookOpen className="h-4 w-4 shrink-0 text-amber" />
        <p className="text-sm text-ivory">
          Resumed at{' '}
          <span className="font-medium text-amber">
            {Math.round(progress.scrollPct)}%
          </span>
          {progress.sceneIndex > 0 && (
            <>
              {' '}
              · Scene{' '}
              <span className="font-medium text-amber">
                {progress.sceneIndex + 1}
              </span>
            </>
          )}
        </p>
        <button
          onClick={onStartOver}
          className="ml-1 shrink-0 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-slate transition-colors hover:bg-amber/10 hover:text-amber"
        >
          Start over
        </button>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-1 text-slate transition-colors hover:bg-amber/10 hover:text-amber"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  )
}
