/**
 * Lemniscate — Motion System
 * ----------------------------------------------------------------------------
 * Spring physics, cinematic easing, layered transitions.
 * Inspired by Apple HIG, Linear, Arc Browser, Framer Motion best practices.
 */

import type { Variants } from 'framer-motion'

// ─── Easing curves ──────────────────────────────────────────────────────────

export const ease = {
  /** Expo out — dramatic entrance, fast start, slow settle */
  out: [0.16, 1, 0.3, 1] as const,
  /** Quart in-out — smooth symmetric */
  inOut: [0.76, 0, 0.24, 1] as const,
  /** Cinema — natural deceleration with a slight anticipation */
  cinema: [0.22, 1, 0.36, 1] as const,
  /** Gentle — for ambient/background motion */
  gentle: [0.4, 0, 0.2, 1] as const,
}

// ─── Spring presets ──────────────────────────────────────────────────────────

export const spring = {
  /** Default — balanced, natural */
  default: { type: 'spring', stiffness: 280, damping: 26, mass: 0.8 },
  /** Snappy — for buttons, toggles, micro-interactions */
  snappy: { type: 'spring', stiffness: 400, damping: 30, mass: 0.6 },
  /** Gentle — for large surfaces, page transitions */
  gentle: { type: 'spring', stiffness: 180, damping: 24, mass: 1.0 },
  /** Bouncy — for playful elements (bookmarks, likes) */
  bouncy: { type: 'spring', stiffness: 350, damping: 18, mass: 0.7 },
  /** Slow — for cinematic reveals */
  slow: { type: 'spring', stiffness: 120, damping: 22, mass: 1.2 },
} as const

// ─── Page transitions ────────────────────────────────────────────────────────

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 12, filter: 'blur(6px)' },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.5, ease: ease.cinema },
  },
  exit: {
    opacity: 0,
    y: -8,
    filter: 'blur(4px)',
    transition: { duration: 0.3, ease: ease.inOut },
  },
}

// ─── Stagger children ────────────────────────────────────────────────────────

export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
}

export const staggerFast: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.03 } },
}

// ─── Item reveal ─────────────────────────────────────────────────────────────

export const revealUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: spring.gentle,
  },
}

export const revealFade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.6, ease: ease.out } },
}

export const revealScale: Variants = {
  initial: { opacity: 0, scale: 0.94 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: spring.gentle,
  },
}

export const revealBlur: Variants = {
  initial: { opacity: 0, filter: 'blur(12px)', y: 8 },
  animate: {
    opacity: 1,
    filter: 'blur(0px)',
    y: 0,
    transition: { duration: 0.6, ease: ease.cinema },
  },
}

// ─── Hover / tap ─────────────────────────────────────────────────────────────

export const hoverLift = {
  whileHover: { y: -4, transition: spring.snappy },
  whileTap: { y: -1, scale: 0.98, transition: spring.snappy },
}

export const hoverGlow = {
  whileHover: {
    boxShadow: '0 0 40px oklch(0.82 0.12 75 / 0.2)',
    transition: { duration: 0.3, ease: ease.out },
  },
}

// ─── Book opening (reader entrance) ──────────────────────────────────────────

export const bookOpen: Variants = {
  initial: { opacity: 0, rotateY: -12, scale: 0.92 },
  animate: {
    opacity: 1,
    rotateY: 0,
    scale: 1,
    transition: { ...spring.gentle, duration: 0.8 },
  },
  exit: {
    opacity: 0,
    rotateY: 8,
    scale: 0.96,
    transition: { duration: 0.4, ease: ease.inOut },
  },
}

// ─── Scene transition (within reader) ────────────────────────────────────────

export const sceneTransition: Variants = {
  initial: { opacity: 0, x: 24 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.5, ease: ease.cinema },
  },
  exit: {
    opacity: 0,
    x: -24,
    transition: { duration: 0.3, ease: ease.inOut },
  },
}


