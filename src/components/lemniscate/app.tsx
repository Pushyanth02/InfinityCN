'use client'

import { memo, lazy, Suspense, useEffect } from 'react'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { useLemniscate } from './store'
import { pageTransition } from '@/lib/motion'
import { AppHeader } from './shell/header'
import { AppFooter } from './shell/footer'
import { useWorkerStatus } from './use-worker-status'
import { InfinityFlow } from './logo'
import { ErrorBoundary } from './error-boundary'

// Eager: landing page (first paint — no skeleton flash on initial load)
import { LandingPage } from './views/landing'

// Lazy: all other views — splits ~4,000 lines into on-demand chunks
const LibraryView = lazy(() =>
  import('./views/library').then((m) => ({ default: m.LibraryView })),
)
const ProcessingView = lazy(() =>
  import('./views/processing').then((m) => ({ default: m.ProcessingView })),
)
const ReaderView = lazy(() =>
  import('./views/reader').then((m) => ({ default: m.ReaderView })),
)
const CharactersView = lazy(() =>
  import('./views/characters').then((m) => ({ default: m.CharactersView })),
)
const ScenesView = lazy(() =>
  import('./views/scenes').then((m) => ({ default: m.ScenesView })),
)
const SettingsView = lazy(() =>
  import('./views/settings').then((m) => ({ default: m.SettingsView })),
)

/** Lightweight skeleton shown while a view chunk loads */
const ViewSkeleton = memo(function ViewSkeleton() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <InfinityFlow className="mx-auto h-10 w-20 text-amber/40" />
        <p className="mt-3 text-xs text-slate/50">Loading…</p>
      </div>
    </div>
  )
})

function LemniscateAppInner() {
  const view = useLemniscate((s) => s.view)
  const workerOnline = useWorkerStatus()
  const readerImmersive = useLemniscate((s) => s.readerImmersive)
  const reducedMotion = useLemniscate((s) => s.reducedMotion)

  const isImmersive = view === 'reader' && readerImmersive
  const isLanding = view === 'landing'

  // Prefetch the library view chunk after initial render so navigation feels instant.
  // The landing page is the initial view; library is the most likely next destination.
  useEffect(() => {
    const timer = setTimeout(() => {
      import('./views/library').catch(() => {})
    }, 2000) // 2s delay — don't compete with initial paint
    return () => clearTimeout(timer)
  }, [])

  // Apply the user's reduced-motion preference to the document so CSS animations
  // and transitions are disabled alongside Framer Motion (see MotionConfig below).
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('reduce-motion', reducedMotion)
    return () => root.classList.remove('reduce-motion')
  }, [reducedMotion])

  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>
      <div className="relative flex min-h-screen flex-col">
        {!isImmersive && <AppHeader workerOnline={workerOnline} />}
        <main className="relative flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              variants={pageTransition}
              initial="initial"
              animate="animate"
              exit="exit"
              className="relative"
            >
              <ErrorBoundary>
                <Suspense fallback={<ViewSkeleton />}>
                  {view === 'landing' && <LandingPage />}
                  {view === 'library' && <LibraryView />}
                  {view === 'processing' && <ProcessingView />}
                  {view === 'reader' && <ReaderView />}
                  {view === 'characters' && <CharactersView />}
                  {view === 'scenes' && <ScenesView />}
                  {view === 'settings' && <SettingsView />}
                </Suspense>
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
        {!isImmersive && !isLanding && <AppFooter />}
      </div>
    </MotionConfig>
  )
}

export const LemniscateApp = memo(LemniscateAppInner)
