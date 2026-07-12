'use client'

import { motion } from 'framer-motion'

/** The single hand-tuned ∞ path used by every infinity mark in the logo set.
 *  Defined once so all variants stay perfectly in sync — previously this `d`
 *  string was duplicated across InfinityMark, InfinityFlow, and InfinityHero. */
const INFINITY_PATH =
  'M8 16 C 8 8, 18 8, 24 16 S 40 24, 46 16 S 56 8, 56 16 S 46 24, 40 16 S 24 8, 18 16 S 8 24, 8 16 Z'

/** The Lemniscate ∞ mark — hand-tuned SVG path with animated draw + flow */
export function InfinityMark({
  className = 'h-8 w-8',
  animated = true,
}: {
  className?: string
  animated?: boolean
}) {
  return (
    <svg
      viewBox="0 0 64 32"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <motion.path
        d={INFINITY_PATH}
        initial={animated ? { pathLength: 0, opacity: 0 } : false}
        animate={animated ? { pathLength: 1, opacity: 1 } : false}
        transition={animated ? { duration: 2, ease: [0.16, 1, 0.3, 1] } : {}}
      />
    </svg>
  )
}

/** Animated infinity with flowing dash — for loading / hero */
export function InfinityFlow({ className = 'h-12 w-12' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 32"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path
        d={INFINITY_PATH}
        strokeDasharray="6 4"
        className="lemniscate-flow"
      />
    </svg>
  )
}

/** Large hero infinity with gradient + glow */
export function InfinityHero({ className = 'h-32 w-64' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 32"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="inf-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="oklch(0.88 0.1 80)" />
          <stop offset="50%" stopColor="oklch(0.75 0.13 65)" />
          <stop offset="100%" stopColor="oklch(0.6 0.1 45)" />
        </linearGradient>
        <filter id="inf-glow">
          <feGaussianBlur stdDeviation="0.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <motion.path
        d={INFINITY_PATH}
        stroke="url(#inf-grad)"
        strokeWidth="0.6"
        strokeLinecap="round"
        filter="url(#inf-glow)"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 3, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.path
        d={INFINITY_PATH}
        stroke="url(#inf-grad)"
        strokeWidth="0.3"
        strokeDasharray="3 5"
        strokeLinecap="round"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        transition={{ delay: 2, duration: 1 }}
        className="lemniscate-flow"
      />
    </svg>
  )
}

/** Ornamental divider — gold filigree */
export function Flourish({ className = 'h-3 w-24' }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 12" className={className} fill="none" stroke="currentColor" strokeWidth="0.75" aria-hidden="true">
      <path d="M0 6 L32 6" opacity="0.3" />
      <path d="M64 6 L96 6" opacity="0.3" />
      <circle cx="38" cy="6" r="1" fill="currentColor" opacity="0.5" />
      <circle cx="58" cy="6" r="1" fill="currentColor" opacity="0.5" />
      <path d="M42 6 C 42 3, 48 3, 48 6 S 54 9, 54 6 S 48 3, 48 6 S 42 9, 42 6 Z" strokeWidth="1" />
    </svg>
  )
}
