'use client'

/**
 * Lemniscate — Landing page
 * ----------------------------------------------------------------------------
 * The marketing landing page. This file is the thin orchestrator that composes
 * the section modules in order; each section lives in its own `landing-*`
 * module and was extracted verbatim from the original monolith. Shared helpers
 * (particle field, section eyebrow, sample-story hook) live in `landing-shared`.
 */

import { motion } from 'framer-motion'
import { pageTransition } from '@/lib/motion'

import { HeroSection } from './landing-hero'
import { TransformPreview } from './landing-transform-preview'
import { TwoModesShowcase } from './landing-two-modes'
import { FeatureHighlights } from './landing-features'
import { StatsStrip } from './landing-stats'
import { FAQ } from './landing-faq'
import { FinalCTA } from './landing-final-cta'
import { LandingFooter } from './landing-footer'

// ═══════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════

export function LandingPage() {
  return (
    <motion.div
      variants={pageTransition}
      initial="initial"
      animate="animate"
      className="relative"
    >
      <HeroSection />
      <TransformPreview />
      <TwoModesShowcase />
      <FeatureHighlights />
      <StatsStrip />
      <FAQ />
      <FinalCTA />
      <LandingFooter />
    </motion.div>
  )
}
