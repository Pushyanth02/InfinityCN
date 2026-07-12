'use client'

/**
 * Lemniscate — Settings
 * ----------------------------------------------------------------------------
 * Orchestrator for the settings view: back navigation, header, and the stacked
 * settings sections. The reusable controls live in `settings-controls` and the
 * individual cards in `settings-sections`; each was extracted verbatim from the
 * original monolith.
 */

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { useLemniscate } from '../store'
import { Flourish } from '../logo'
import { staggerContainer } from '@/lib/motion'
import { ArrowLeft } from 'lucide-react'
import {
  AppearanceCard,
  ReadingPreferencesCard,
  AccessibilityCard,
  PrivacyCard,
  AboutCard,
} from './settings-sections'

export function SettingsView() {
  const openLibrary = useLemniscate((s) => s.openLibrary)

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={openLibrary} className="gap-1.5 text-slate hover:text-amber">
          <ArrowLeft className="h-4 w-4" /> Library
        </Button>
      </div>

      <div className="space-y-1">
        <h1 className="text-headline text-ivory">Settings</h1>
        <p className="text-sm text-slate">Customize your reading experience</p>
        <Flourish className="mt-2 h-3 w-32 text-amber/30" />
      </div>

      <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-4">
        <AppearanceCard />
        <ReadingPreferencesCard />
        <AccessibilityCard />
        <PrivacyCard />
        <AboutCard />
      </motion.div>
    </div>
  )
}
