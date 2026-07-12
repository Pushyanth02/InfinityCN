'use client'

/**
 * Lemniscate — Landing shared helpers
 * ----------------------------------------------------------------------------
 * Small pieces shared across the landing sections: the deterministic floating
 * particle field, the centered section eyebrow, and the sample-story handler
 * hook. Extracted verbatim from `landing.tsx`; behavior is unchanged.
 */

import * as React from 'react'
import { motion } from 'framer-motion'
import { revealUp } from '@/lib/motion'
import { useLemniscate } from '../store'
import { useToast } from '@/hooks/use-toast'

// ─── Floating amber particles ──────────────────────────────────────────────
export function FloatingParticles() {
  // Deterministic particle config — avoids hydration mismatch.
  const particles = React.useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        id: i,
        left: 6 + i * 12 + (i % 3) * 4,
        size: 2 + (i % 3),
        delay: (i * 1.7) % 9,
        duration: 16 + (i % 4) * 4,
        drift: (i % 2 === 0 ? 1 : -1) * (18 + i * 4),
        opacity: 0.12 + (i % 4) * 0.05,
      })),
    []
  )

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.left}%`,
            bottom: '-30px',
            width: p.size,
            height: p.size,
            backgroundColor: 'oklch(0.82 0.12 75)',
            boxShadow: '0 0 10px oklch(0.82 0.12 75 / 0.7)',
          }}
          initial={{ opacity: 0, y: 0, x: 0 }}
          animate={{
            opacity: [0, p.opacity, p.opacity * 0.5, p.opacity, 0],
            y: [0, -900],
            x: [0, p.drift, -p.drift, p.drift, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

// ─── Section heading helper ────────────────────────────────────────────────
export function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={revealUp}
      className="mb-4 flex items-center justify-center gap-3"
    >
      <span className="h-px w-8 bg-linear-to-r from-transparent to-amber/40" />
      <span className="font-mono text-xs uppercase tracking-[0.32em] text-amber/80">
        {children}
      </span>
      <span className="h-px w-8 bg-linear-to-l from-transparent to-amber/40" />
    </motion.div>
  )
}

// ─── Sample-story button (used twice) ──────────────────────────────────────
export function useSampleHandler() {
  const openProcessing = useLemniscate((s) => s.openProcessing)
  const { toast } = useToast()
  const [loading, setLoading] = React.useState(false)

  const run = React.useCallback(async () => {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/sample?mode=BOTH', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Sample creation failed')
      toast({
        title: 'Sample narrative queued',
        description:
          '“The Last Lighthouse of Veyrn” → Original + Cinematified.',
      })
      openProcessing(data.jobId, data.documentId)
    } catch (err) {
      toast({
        title: 'Could not start sample',
        description: (err as Error).message,
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [loading, openProcessing, toast])

  return { run, loading }
}
