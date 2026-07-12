'use client'

/**
 * Lemniscate — Landing footer
 * ----------------------------------------------------------------------------
 * The closing flourish and offline/deterministic tagline. Extracted verbatim
 * from `landing.tsx`; behavior is unchanged.
 */

import { Flourish } from '../logo'

// ═══════════════════════════════════════════════════════════════════════════
// 8. FOOTER SPACE
// ═══════════════════════════════════════════════════════════════════════════

export function LandingFooter() {
  return (
    <footer className="px-4 pb-12 pt-8 sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
        <Flourish className="h-3 w-32 text-amber/50" />
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-[0.25em] text-slate">
          <span>Lemniscate</span>
          <span className="text-amber/40">∞</span>
          <span>Deterministic</span>
          <span className="text-amber/40">∞</span>
          <span>Offline</span>
          <span className="text-amber/40">∞</span>
          <span>Yours</span>
        </div>
        <p className="text-xs text-slate/60">
          © {new Date().getFullYear()} Lemniscate. Transform documents into
          living narratives — no AI, no cloud, no compromise.
        </p>
      </div>
    </footer>
  )
}
