'use client'

/**
 * Lemniscate — Reader status views (empty / loading / error)
 * ----------------------------------------------------------------------------
 * Presentational states for the reader. Extracted from `reader.tsx` (Phase 4
 * decomposition) — behavior unchanged.
 */
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { BookOpen, Library, AlertCircle, RotateCcw } from 'lucide-react'
import { useLemniscate } from '../store'
import { InfinityFlow, Flourish } from '../logo'
import { spring, hoverLift } from '@/lib/motion'

export function EmptyState() {
  const openLibrary = useLemniscate((s) => s.openLibrary)
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6 py-20">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.gentle, duration: 0.7 }}
        className="text-center"
      >
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-amber/20 bg-plum/30 text-amber/60">
          <BookOpen className="h-9 w-9" />
        </div>
        <h2 className="text-headline text-ivory">No narrative selected</h2>
        <p className="mx-auto mt-3 max-w-md text-pretty text-sm text-slate">
          Select a narrative from your library and the reader will open it here,
          beautifully typeset.
        </p>
        <motion.div {...hoverLift} className="mt-6 inline-block">
          <Button
            onClick={openLibrary}
            variant="outline"
            className="border-amber/30 text-amber hover:bg-amber/10 hover:text-amber"
          >
            <Library className="h-4 w-4" />
            Open Library
          </Button>
        </motion.div>
      </motion.div>
    </div>
  )
}

export function LoadingState() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <div className="flex flex-col items-center gap-5 pb-16 text-center">
        <InfinityFlow className="h-12 w-24 text-amber" />
        <div className="space-y-1">
          <p className="font-serif text-ivory">Opening narrative…</p>
          <p className="text-xs uppercase tracking-[0.3em] text-amber/50">
            Lemniscate Reader
          </p>
        </div>
      </div>
      <div className="space-y-6">
        <Skeleton className="h-10 w-2/3 rounded-lg bg-amber/10" />
        <Skeleton className="h-4 w-1/3 bg-amber/5" />
        <div className="my-8 flex justify-center">
          <Flourish className="h-3 w-32 text-amber/30" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton
              className="h-4 w-full rounded bg-amber/5"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
            <Skeleton
              className="h-4 w-[94%] rounded bg-amber/5"
              style={{ animationDelay: `${i * 0.15 + 0.05}s` }}
            />
            <Skeleton
              className="h-4 w-[88%] rounded bg-amber/5"
              style={{ animationDelay: `${i * 0.15 + 0.1}s` }}
            />
          </div>
        ))}
        <div className="flex justify-center pt-6">
          <Skeleton className="h-4 w-24 rounded bg-amber/10" />
        </div>
      </div>
    </div>
  )
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const openLibrary = useLemniscate((s) => s.openLibrary)
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6 py-20">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={spring.gentle}
      >
        <Card className="max-w-md border-tension/30 bg-plum/20 p-8 text-center shadow-cinema">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-tension/40 bg-tension/10 text-tension">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h2 className="text-title text-ivory">Could not open narrative</h2>
          <p className="mt-2 text-sm text-slate">
            The narrative may have been removed, or the request failed. You can
            try again, or return to your library.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <motion.div {...hoverLift}>
              <Button
                onClick={onRetry}
                className="bg-amber text-midnight hover:bg-amber/90"
              >
                <RotateCcw className="h-4 w-4" />
                Retry
              </Button>
            </motion.div>
            <motion.div {...hoverLift}>
              <Button
                onClick={openLibrary}
                variant="outline"
                className="border-amber/30 text-amber hover:bg-amber/10"
              >
                <Library className="h-4 w-4" />
                Library
              </Button>
            </motion.div>
          </div>
        </Card>
      </motion.div>
    </div>
  )
}
