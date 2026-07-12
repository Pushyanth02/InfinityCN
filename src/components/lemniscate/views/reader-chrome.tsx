'use client'

/**
 * Lemniscate — Reader chrome
 * ----------------------------------------------------------------------------
 * The reader's structural surround, extracted verbatim from `reader.tsx`:
 *   • TopProgressBar — scroll-driven progress rail pinned to the top.
 *   • ReaderSidebar  — collapsible explorer (scenes, bookmarks, arcs, peaks).
 *   • BottomNav      — scene/scroll navigation dock.
 * Behavior is unchanged; these are presentational pieces driven by props.
 */

import { motion, type MotionValue } from 'framer-motion'
import { Bookmark, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'

import { type ReaderMode } from '../store'
import { spring } from '@/lib/motion'
import { Button } from '@/components/ui/button'
import { buildSceneHeading } from './reader-shared'
import { cn } from '@/lib/utils'
import type {
  ReaderScene,
  ReaderLocation,
  ReaderArc,
  ReaderPeak,
  ReaderBookmark,
} from './reader-types'

// ─── Top progress bar ─────────────────────────────────────────────────────────

export function TopProgressBar({ progress }: { progress: MotionValue<number> }) {
  // progress is a 0..1 MotionValue — animated via spring for smoothness.
  return (
    <div
      className="fixed inset-x-0 top-0 z-60 h-[3px] bg-transparent"
      aria-hidden="true"
    >
      <motion.div
        className="h-full origin-left"
        style={{
          scaleX: progress,
          background:
            'linear-gradient(90deg, oklch(0.6 0.14 165) 0%, oklch(0.82 0.12 75) 50%, oklch(0.55 0.2 22) 100%)',
          boxShadow: '0 0 12px oklch(0.82 0.12 75 / 0.5)',
        }}
      />
    </div>
  )
}

// ─── Right sidebar (Cinematified, non-immersive) ─────────────────────────────

interface SidebarProps {
  scenes: ReaderScene[]
  locations: ReaderLocation[]
  arcs?: ReaderArc[]
  peaks?: ReaderPeak[]
  currentSceneIdx: number
  onJumpScene: (i: number) => void
  onJumpPeak?: (peak: ReaderPeak) => void
  bookmarks: ReaderBookmark[]
  onJumpBookmark: (bm: ReaderBookmark) => void
  onDeleteBookmark: (id: string) => void
  /** Persisted collapse state. When true the rail animates to zero width but
   *  stays mounted — so the reader never re-renders and scroll position is
   *  preserved across toggles. */
  collapsed: boolean
}

export function ReaderSidebar({
  scenes,
  locations,
  arcs,
  peaks,
  currentSceneIdx,
  onJumpScene,
  onJumpPeak,
  bookmarks,
  onJumpBookmark,
  onDeleteBookmark,
  collapsed,
}: SidebarProps) {
  const current = scenes[currentSceneIdx]
  // Collapse animation: width + horizontal padding shrink to zero. The inner
  // content stays in the DOM (visibility/opacity only) so toggling never
  // remounts the reader or resets scroll. Reduced-motion users skip the spring.
  return (
    <motion.aside
      initial={false}
      animate={{
        width: collapsed ? 0 : 288,
        paddingLeft: collapsed ? 0 : 16,
        paddingRight: collapsed ? 0 : 16,
        opacity: collapsed ? 0 : 1,
      }}
      transition={spring.gentle}
      className="sticky top-20 hidden h-[calc(100vh-6rem)] shrink-0 overflow-hidden rounded-xl border border-amber/15 bg-plum/20 backdrop-blur-xl scrollbar-lemniscate lg:block"
      aria-label="Reader explorer"
      aria-hidden={collapsed}
      style={{ pointerEvents: collapsed ? 'none' : 'auto' }}
    >
      {/* Current scene */}
      {current && (
        <div className="mb-5">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-amber/50">
            Current Scene
          </p>
          <div className="rounded-lg border border-amber/15 bg-midnight/40 p-3">
            <p className="font-serif text-sm text-ivory">
              <span className="text-amber/60">{current.index + 1}.</span>{' '}
              {current.title}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-amber/60">
              {buildSceneHeading(current, locations)}
            </p>
          </div>
        </div>
      )}

      {/* Scene jump list */}
      <div className="mb-5">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-amber/50">
          Scenes · {scenes.length}
        </p>
        <div className="max-h-72 space-y-0.5 overflow-y-auto scrollbar-lemniscate">
          {scenes.map((s) => {
            const active = s.index === currentSceneIdx
            return (
              <button
                key={s.id}
                onClick={() => onJumpScene(s.index)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors',
                  active
                    ? 'bg-amber/15 text-amber'
                    : 'text-slate hover:bg-amber/5 hover:text-ivory',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    active ? 'bg-amber' : 'bg-amber/20',
                  )}
                />
                <span className="shrink-0 font-mono text-[10px] text-amber/50">
                  {String(s.index + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Bookmarks */}
      <div className="mb-5">
        <div className="mb-2 flex items-center gap-2">
          <Bookmark className="h-3 w-3 text-amber/50" />
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber/50">
            Bookmarks · {bookmarks.length}
          </p>
        </div>
        {bookmarks.length === 0 ? (
          <p className="px-1 text-[11px] italic text-slate/70">
            Click the bookmark icon in the top bar to save a position.
          </p>
        ) : (
          <div className="max-h-60 space-y-0.5 overflow-y-auto scrollbar-lemniscate">
            {bookmarks.map((bm) => (
              <div
                key={bm.id}
                className="group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-amber/5"
              >
                <Bookmark className="h-3 w-3 shrink-0 text-amber/60" />
                <button
                  onClick={() => onJumpBookmark(bm)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-ivory">
                    {bm.label ||
                      (bm.sceneIndex != null
                        ? `Scene ${bm.sceneIndex + 1}`
                        : 'Position')}
                  </p>
                  <p className="font-mono text-[9px] uppercase tracking-wide text-amber/50">
                    {Math.round(bm.offset)}%
                    {bm.sceneIndex != null
                      ? ` · Scene ${bm.sceneIndex + 1}`
                      : ''}
                  </p>
                </button>
                <button
                  onClick={() => onDeleteBookmark(bm.id)}
                  aria-label="Delete bookmark"
                  className="shrink-0 text-slate opacity-0 transition-all hover:text-tension group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Narrative arcs */}
      {arcs && arcs.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-amber/50">
            Arcs · {arcs.length}
          </p>
          <div className="space-y-1">
            {arcs.map((a) => {
              const color =
                a.arcType === 'CLIMAX' ? 'var(--tension)'
                  : a.arcType === 'INCITING' ? 'var(--amber)'
                    : a.arcType === 'RESOLUTION' ? 'var(--slate)'
                      : 'var(--amber)'
              return (
                <button
                  key={a.id}
                  onClick={() => onJumpScene(a.startSceneIdx)}
                  className="group flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-amber/5"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: color }}
                    />
                    <span className="text-[12px] text-ivory">{a.name}</span>
                  </div>
                  <div className="ml-3.5 h-1 w-full max-w-[120px] overflow-hidden rounded-full bg-amber/10">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(4, Math.min(100, a.intensity))}%`, background: color }}
                    />
                  </div>
                  <p className="ml-3.5 font-mono text-[9px] uppercase tracking-wide text-amber/50">
                    Scenes {a.startSceneIdx + 1}–{a.endSceneIdx + 1}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Emotional peaks */}
      {peaks && peaks.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-amber/50">
            Key Moments · {peaks.length}
          </p>
          <div className="max-h-60 space-y-0.5 overflow-y-auto scrollbar-lemniscate">
            {peaks.slice(0, 20).map((p) => (
              <button
                key={p.id}
                onClick={() => onJumpPeak?.(p)}
                className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-amber/5"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber/40 group-hover:bg-amber" />
                <span className="truncate text-[11px] italic text-slate group-hover:text-ivory">
                  {p.snippet}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.aside>
  )
}

// ─── Bottom navigation ───────────────────────────────────────────────────────

interface BottomNavProps {
  mode: ReaderMode
  sceneCount: number
  currentSceneIdx: number
  onPrev: () => void
  onNext: () => void
  progress: number
  immersive: boolean
}

export function BottomNav({
  mode,
  sceneCount,
  currentSceneIdx,
  onPrev,
  onNext,
  progress,
  immersive,
}: BottomNavProps) {
  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={spring.gentle}
      className={cn(
        'fixed inset-x-0 bottom-0 z-50',
        immersive && 'pointer-events-none',
      )}
    >
      <div className="mx-auto max-w-3xl px-4 pb-4 sm:px-6">
        <div
          className={cn(
            'glass-strong flex items-center gap-3 rounded-full border border-amber/20 px-3 py-2 shadow-cinema',
            immersive && 'pointer-events-auto',
          )}
        >
          {/* Prev */}
          <Button
            onClick={onPrev}
            variant="ghost"
            size="icon"
            disabled={mode === 'CINEMATIFIED' && currentSceneIdx <= 0}
            aria-label="Previous"
            className="h-9 w-9 shrink-0 rounded-full text-amber hover:bg-amber/10"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Center: counter or scroll progress */}
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
            {mode === 'CINEMATIFIED' ? (
              <>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-amber/80">
                  Scene {currentSceneIdx + 1} of {sceneCount}
                </p>
                <div className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-amber/10">
                  <motion.div
                    className="h-full rounded-full bg-amber"
                    initial={{ width: 0 }}
                    animate={{
                      width:
                        sceneCount > 0
                          ? `${((currentSceneIdx + 1) / sceneCount) * 100}%`
                          : '0%',
                    }}
                    transition={spring.snappy}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-amber/80">
                  {Math.round(progress * 100)}% read
                </p>
                <div className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-amber/10">
                  <motion.div
                    className="h-full rounded-full bg-amber"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress * 100}%` }}
                    transition={spring.snappy}
                  />
                </div>
              </>
            )}
          </div>

          {/* Next */}
          <Button
            onClick={onNext}
            variant="ghost"
            size="icon"
            disabled={
              mode === 'CINEMATIFIED' && currentSceneIdx >= sceneCount - 1
            }
            aria-label="Next"
            className="h-9 w-9 shrink-0 rounded-full text-amber hover:bg-amber/10"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
