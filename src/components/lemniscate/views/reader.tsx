'use client'

/**
 * Lemniscate — Reader View
 * ============================================================================
 * The premium reading experience. "Apple Books + Kindle + Linear + Netflix".
 *
 * Two modes:
 *   • ORIGINAL — faithful, beautifully typeset long-form prose.
 *   • CINEMATIFIED — cinematic screenplay with scene cards, tension rails,
 *     mood indicators, and on-the-side scene navigation.
 *
 * Features: immersive mode, font-size cycle, theme override (sepia/dark),
 * keyboard navigation (Esc / ←/→), scroll-driven progress bar, in-view
 * paragraph staggering, abortable fetch, robust empty / loading / error states.
 *
 * Palette: midnight · ivory · amber · slate · burgundy  —  no blue / indigo.
 */

import * as React from 'react'
import { useRef } from 'react'
import {
  motion,
  AnimatePresence,
  useScroll,
  useSpring,
  useMotionValueEvent,
} from 'framer-motion'
import { PanelRightOpen } from 'lucide-react'

import {
  useLemniscate,
  type ReaderMode,
} from '../store'
import {
  bookOpen,
  spring,
} from '@/lib/motion'
import { useToast } from '@/hooks/use-toast'
import { SearchOverlay } from './reader-search-overlay'
import { TopBar } from './reader-top-bar'
import { EmptyState, LoadingState, ErrorState } from './reader-status'
import { ContinueReadingHint } from './reader-overlays'
import { FONT_SIZE_ORDER } from './reader-shared'
import { OriginalReader } from './reader-original'
import { CinematifiedReader } from './reader-cinematified'
import { TopProgressBar, ReaderSidebar, BottomNav } from './reader-chrome'
import type {
  ReaderBookmark,
  ReaderProgress,
  ReaderPeak,
  ReaderNarrative,
} from './reader-types'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

// ─── Main ReaderView ─────────────────────────────────────────────────────────

export function ReaderView() {
  const narrativeId = useLemniscate((s) => s.activeNarrativeId)
  const activeMode = useLemniscate((s) => s.activeMode)
  const activeDocumentId = useLemniscate((s) => s.activeDocumentId)
  const desiredMode = useLemniscate((s) => s.desiredMode)
  const setDesiredMode = useLemniscate((s) => s.setDesiredMode)
  const fontSize = useLemniscate((s) => s.readerFontSize)
  const readerTheme = useLemniscate((s) => s.readerTheme)
  const immersive = useLemniscate((s) => s.readerImmersive)
  const sidebarCollapsed = useLemniscate((s) => s.readerSidebarCollapsed)
  const toggleSidebar = useLemniscate((s) => s.toggleReaderSidebar)
  const openLibrary = useLemniscate((s) => s.openLibrary)
  const openCharacters = useLemniscate((s) => s.openCharacters)
  const openScenes = useLemniscate((s) => s.openScenes)
  const setReaderFontSize = useLemniscate((s) => s.setReaderFontSize)
  const setReaderTheme = useLemniscate((s) => s.setReaderTheme)
  const toggleImmersive = useLemniscate((s) => s.toggleReaderImmersive)
  const { toast } = useToast()
  const { theme: globalTheme, setTheme: setGlobalTheme } = useTheme()

  const [narrative, setNarrative] = React.useState<ReaderNarrative | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Scroll progress (0..1) — spring-smoothed MotionValue for the top bar,
  // plus a sampled number for the bottom-nav percentage display.
  const { scrollYProgress } = useScroll()
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 30,
    mass: 0.4,
  })
  const [progress, setProgress] = React.useState(0)
  // Only re-render when the integer percent changes. The MotionValue updates
  // every animation frame; `progress` is consumed only as a rounded percentage
  // (bottom-nav display, bookmark 3% proximity) — so we coalesce sub-percent
  // deltas into one setState per whole-percent change. This cuts reader
  // re-renders from ~60/s to ~1/s while scrolling.
  useMotionValueEvent(smoothProgress, 'change', (v) => {
    // Whole-percent granularity only — both consumers (the bottom-nav
    // percentage and the 3% bookmark-proximity check) are integer-based,
    // so finer deltas would be discarded by Math.round anyway.
    const pct = Math.round(v * 100)
    setProgress((cur) => (cur !== pct ? pct : cur))
  })

  // Active scene index (cinematified)
  const [currentSceneIdx, setCurrentSceneIdx] = React.useState(0)

  // Scene refs for jumping
  const sceneRefs = useRef<Map<number, HTMLElement | null>>(new Map())

  // Controls visibility (immersive mode)
  const [controlsVisible, setControlsVisible] = React.useState(!immersive)
  const activityTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Power-user feature state ──────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [bookmarksListOpen, setBookmarksListOpen] = React.useState(false)
  const [bookmarks, setBookmarks] = React.useState<ReaderBookmark[]>([])
  const [savedProgress, setSavedProgress] =
    React.useState<ReaderProgress | null>(null)
  const [progressRestored, setProgressRestored] = React.useState(false)
  const [showContinueHint, setShowContinueHint] = React.useState(false)
  const [currentParagraphIdx, setCurrentParagraphIdx] = React.useState(0)

  // Refs to track latest values without re-creating callbacks
  const restoringRef = useRef(false)
  const lastSaveRef = useRef(0)
  const currentSceneIdxRef = useRef(currentSceneIdx)
  const currentParagraphIdxRef = useRef(currentParagraphIdx)
  const activeModeRef = useRef(activeMode)
  const narrativeModeRef = useRef<ReaderMode | null>(null)
  // Dual-mode: cache loaded narratives so switching back is instant, and a
  // flag to suppress progress-save churn during a mode swap.
  const narrativeCacheRef = useRef<Map<string, ReaderNarrative>>(new Map())
  const switchingRef = useRef(false)
  // The id of the narrative currently rendered in the reader. Progress saves
  // and bookmark loads target THIS id (not the originally-opened one) so a
  // mode switch persists state to the correct sibling narrative.
  const loadedNarrativeIdRef = useRef<string | null>(narrativeId)

  /** Re-apply a scroll percentage after the DOM has settled post-render. */
  const applyScrollPct = React.useCallback((scrollPct: number) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const scrollableHeight =
          document.documentElement.scrollHeight - window.innerHeight
        const targetY = (scrollPct / 100) * Math.max(0, scrollableHeight)
        window.scrollTo({ top: targetY, behavior: 'auto' })
        setTimeout(() => {
          switchingRef.current = false
        }, 400)
      })
    })
  }, [])
  React.useEffect(() => {
    currentSceneIdxRef.current = currentSceneIdx
  }, [currentSceneIdx])
  React.useEffect(() => {
    currentParagraphIdxRef.current = currentParagraphIdx
  }, [currentParagraphIdx])
  React.useEffect(() => {
    activeModeRef.current = activeMode
  }, [activeMode])
  React.useEffect(() => {
    if (narrative) narrativeModeRef.current = narrative.mode
  }, [narrative])
  // Keep loadedNarrativeIdRef in sync with the rendered narrative so
  // progress saves target the currently-shown row (correct after a switch).
  React.useEffect(() => {
    if (narrative) loadedNarrativeIdRef.current = narrative.id
  }, [narrative])

  // ─── Fetch narrative ──────────────────────────────────────────────────────
  const fetchNarrative = React.useCallback(() => {
    if (!narrativeId) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetch(`/api/narratives/${narrativeId}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!data.narrative) throw new Error('No narrative in response')
        setNarrative(data.narrative as ReaderNarrative)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        const message =
          err instanceof Error ? err.message : 'Unknown fetch error'
        setError(message)
        setLoading(false)
      })
    return () => controller.abort()
  }, [narrativeId])

  React.useEffect(() => {
    const cleanup = fetchNarrative()
    return cleanup
  }, [fetchNarrative])

  // Cache the loaded narrative so a mode switch back doesn't refetch.
  React.useEffect(() => {
    if (narrative) {
      narrativeCacheRef.current.set(narrative.id, narrative)
      // Track the currently-rendered narrative's id so progress saves and
      // bookmark loads target the correct row after a mode switch.
      loadedNarrativeIdRef.current = narrative.id
    }
  }, [narrative])

  // ─── Dual-mode: resolve both sibling narratives on the same document ───────
  // Original and Cinematified are separate Narrative rows. We discover both via
  // the document's narrative list so the reader can toggle between them without
  // reprocessing (both already exist from a BOTH job). Modes without a sibling
  // simply hide the toggle.
  const [siblingMap, setSiblingMap] = React.useState<Record<ReaderMode, string | null>>({
    ORIGINAL: null,
    CINEMATIFIED: null,
  })
  React.useEffect(() => {
    if (!activeDocumentId) return
    let cancelled = false
    fetch(`/api/documents/${activeDocumentId}/narratives`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        const narrs: { id: string; mode: string }[] = data.narratives ?? []
        const map: Record<ReaderMode, string | null> = { ORIGINAL: null, CINEMATIFIED: null }
        for (const n of narrs) {
          if (n.mode === 'ORIGINAL') map.ORIGINAL = n.id
          else if (n.mode === 'CINEMATIFIED') map.CINEMATIFIED = n.id
        }
        setSiblingMap(map)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [activeDocumentId])

  // The effective narrative id follows `desiredMode` when its sibling exists;
  // otherwise it stays on the originally-opened narrative.
  const effectiveNarrativeId =
    (desiredMode && siblingMap[desiredMode]) || narrativeId

  // ─── Mode switch: swap to the sibling narrative, preserving scroll position ─
  // No reprocessing — both narratives already exist. We capture the current
  // scroll percentage before the swap and re-apply it after the new narrative's
  // DOM settles (two RAFs), so continuous reading position is preserved.
  React.useEffect(() => {
    if (!effectiveNarrativeId) return
    // Same id as what's loaded → nothing to do.
    if (narrative && narrative.id === effectiveNarrativeId) return
    // Capture scroll % before swapping.
    const scrollPct =
      document.documentElement.scrollHeight > window.innerHeight
        ? Math.min(
            100,
            Math.max(
              0,
              (window.scrollY /
                Math.max(1, document.documentElement.scrollHeight - window.innerHeight)) *
                100,
            ),
          )
        : 0
    const cached = narrativeCacheRef.current.get(effectiveNarrativeId)
    switchingRef.current = true
    if (cached) {
      setNarrative(cached)
      setLoading(false)
      applyScrollPct(scrollPct)
    } else {
      const controller = new AbortController()
      setLoading(true)
      fetch(`/api/narratives/${effectiveNarrativeId}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = await res.json()
          if (!data.narrative) throw new Error('No narrative in response')
          setNarrative(data.narrative as ReaderNarrative)
          setLoading(false)
          applyScrollPct(scrollPct)
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          setError(err instanceof Error ? err.message : 'Unknown fetch error')
          setLoading(false)
        })
      return () => controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveNarrativeId])

  // (applyScrollPct + switchingRef are declared with the other refs above.)

  // ─── Theme sync: readerTheme follows the global theme, toggle updates both ─
  React.useEffect(() => {
    if (globalTheme === 'light' || globalTheme === 'dark') {
      if (globalTheme !== readerTheme) setReaderTheme(globalTheme)
    }
  }, [globalTheme, readerTheme, setReaderTheme])

  // ─── Reading progress: fetch whenever the effective narrative changes ───────
  // (Initial open AND after a mode switch — each narrative has its own progress.)
  React.useEffect(() => {
    if (!effectiveNarrativeId) return
    let cancelled = false
    // Re-enable position restoration for the freshly-loaded narrative.
    setProgressRestored(false)
    fetch(`/api/narratives/${effectiveNarrativeId}/progress`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data.progress) {
          setSavedProgress(data.progress as ReaderProgress)
        } else {
          setSavedProgress(null)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [effectiveNarrativeId])

  // ─── Restore scroll position once narrative renders ────────────────────────
  // Suppressed during a mode switch (switchingRef) — the mode-switch effect
  // already re-applies the captured reading position. On initial open
  // switchingRef is false, so saved-progress restoration works as before.
  React.useEffect(() => {
    if (switchingRef.current) return
    if (!narrative || !savedProgress || progressRestored) return
    if (savedProgress.scrollPct <= 0) {
      setProgressRestored(true)
      return
    }
    restoringRef.current = true
    // Wait two RAFs for DOM to settle after content render
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const scrollableHeight =
          document.documentElement.scrollHeight - window.innerHeight
        const targetY =
          (savedProgress.scrollPct / 100) * Math.max(0, scrollableHeight)
        window.scrollTo({ top: targetY, behavior: 'auto' })
        setShowContinueHint(true)
        // Release the restoring flag after a beat so the
        // scroll-to-position doesn't trigger a save with stale data
        setTimeout(() => {
          restoringRef.current = false
          setProgressRestored(true)
        }, 500)
      })
    })
  }, [narrative, savedProgress, progressRestored])

  // ─── Save reading progress (debounced ~3s) ─────────────────────────────────
  // Targets the *rendered* narrative (loadedNarrativeIdRef), so a mode switch
  // persists progress to the correct sibling row rather than the one originally
  // opened.
  const saveProgress = React.useCallback(
    (force = false) => {
      const targetId = loadedNarrativeIdRef.current
      if (!targetId || restoringRef.current) return
      const now = Date.now()
      if (!force && now - lastSaveRef.current < 2500) return

      const scrollPct = Math.min(
        100,
        Math.max(
          0,
          Math.round(
            (window.scrollY /
              Math.max(
                1,
                document.documentElement.scrollHeight - window.innerHeight,
              )) *
              100,
          ),
        ),
      )

      // Find the paragraph closest to the top of the viewport
      let paragraphIdx = 0
      const paragraphs = document.querySelectorAll<HTMLElement>(
        '[data-paragraph-idx]',
      )
      if (paragraphs.length > 0) {
        const viewportTop = window.scrollY + window.innerHeight * 0.25
        let closestDist = Infinity
        paragraphs.forEach((el) => {
          const absTop = el.getBoundingClientRect().top + window.scrollY
          const dist = Math.abs(absTop - viewportTop)
          if (dist < closestDist) {
            closestDist = dist
            const idx = parseInt(el.dataset.paragraphIdx || '0', 10)
            if (!Number.isNaN(idx)) paragraphIdx = idx
          }
        })
      }

      // sceneIndex is meaningful only when the *rendered* narrative is
      // cinematified. narrativeModeRef tracks the loaded narrative's mode, so
      // it stays correct across a mode switch (activeModeRef would be stale).
      const isCine = narrativeModeRef.current === 'CINEMATIFIED'
      const sceneIndex = isCine ? currentSceneIdxRef.current : 0

      lastSaveRef.current = now
      fetch(`/api/narratives/${targetId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scrollPct, sceneIndex, paragraphIdx }),
      }).catch(() => {})
    },
    // No deps: the target id is read from a ref so this callback is stable
    // and always targets the currently-rendered narrative.
    [],
  )

  // Auto-save every 3s while reading
  React.useEffect(() => {
    if (!progressRestored) return
    const interval = setInterval(() => saveProgress(), 3000)
    return () => clearInterval(interval)
  }, [progressRestored, saveProgress])

  // Save on unmount / narrative switch
  React.useEffect(() => {
    return () => {
      saveProgress(true)
    }
  }, [saveProgress])

  // ─── Bookmarks: fetch on mount + when the effective narrative changes ───────
  // (effectiveNarrativeId so bookmarks follow a mode switch to the sibling row.)
  const refreshBookmarks = React.useCallback(() => {
    if (!effectiveNarrativeId) return
    fetch(`/api/narratives/${effectiveNarrativeId}/bookmarks`)
      .then((r) => r.json())
      .then((data) =>
        setBookmarks((data.bookmarks as ReaderBookmark[]) || []),
      )
      .catch(() => {})
  }, [effectiveNarrativeId])

  React.useEffect(() => {
    refreshBookmarks()
  }, [refreshBookmarks])

  // ─── Activity / controls visibility ────────────────────────────────────────
  const bumpActivity = React.useCallback(() => {
    if (!immersive) {
      setControlsVisible(true)
      return
    }
    setControlsVisible(true)
    if (activityTimer.current) clearTimeout(activityTimer.current)
    activityTimer.current = setTimeout(() => setControlsVisible(false), 3000)
  }, [immersive])

  React.useEffect(() => {
    if (!immersive) {
      setControlsVisible(true)
      return
    }
    // entering immersive — show then auto-hide
    bumpActivity()
    return () => {
      if (activityTimer.current) clearTimeout(activityTimer.current)
    }
  }, [immersive, bumpActivity])

  React.useEffect(() => {
    if (!immersive) return
    const handler = () => bumpActivity()
    window.addEventListener('mousemove', handler)
    window.addEventListener('touchstart', handler)
    window.addEventListener('scroll', handler, { passive: true })
    return () => {
      window.removeEventListener('mousemove', handler)
      window.removeEventListener('touchstart', handler)
      window.removeEventListener('scroll', handler)
    }
  }, [immersive, bumpActivity])

  // ─── Keyboard navigation ───────────────────────────────────────────────────
  const onCycleFont = React.useCallback(
    (dir: 1 | -1) => {
      const i = FONT_SIZE_ORDER.indexOf(fontSize)
      const next = FONT_SIZE_ORDER[(i + dir + FONT_SIZE_ORDER.length) % FONT_SIZE_ORDER.length]
      setReaderFontSize(next)
      toast({
        title: 'Reading size',
        description: next.toUpperCase(),
      })
    },
    [fontSize, setReaderFontSize, toast],
  )

  const onToggleTheme = React.useCallback(() => {
    const next = readerTheme === 'dark' ? 'light' : 'dark'
    setReaderTheme(next)
    setGlobalTheme(next)
  }, [readerTheme, setReaderTheme, setGlobalTheme])

  const jumpScene = React.useCallback(
    (i: number) => {
      const el = sceneRefs.current.get(i)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setCurrentSceneIdx(i)
      }
    },
    [],
  )

  const gotoPrevScene = React.useCallback(() => {
    if (currentSceneIdx > 0) jumpScene(currentSceneIdx - 1)
  }, [currentSceneIdx, jumpScene])

  const gotoNextScene = React.useCallback(() => {
    if (narrative && currentSceneIdx < narrative.scenes.length - 1) {
      jumpScene(currentSceneIdx + 1)
    }
  }, [currentSceneIdx, narrative, jumpScene])

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd/Ctrl+K: open search
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
        return
      }
      // Escape: close overlays first, then exit immersive
      if (e.key === 'Escape') {
        if (searchOpen) {
          e.preventDefault()
          setSearchOpen(false)
          return
        }
        if (bookmarksListOpen) {
          e.preventDefault()
          setBookmarksListOpen(false)
          return
        }
        if (showContinueHint) {
          setShowContinueHint(false)
          return
        }
        if (immersive) {
          e.preventDefault()
          toggleImmersive()
        }
        return
      }
      // [ : toggle the explorer sidebar (cinematified, non-immersive only).
      // Ignored while typing in an input or while any overlay is open.
      if (
        e.key === '[' &&
        narrative?.mode === 'CINEMATIFIED' &&
        !immersive &&
        !searchOpen &&
        !bookmarksListOpen &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault()
        toggleSidebar()
        return
      }
      // Arrow keys: navigate scenes (cinematified only) — disabled while search is open
      if (
        narrative?.mode === 'CINEMATIFIED' &&
        narrative &&
        !searchOpen &&
        !bookmarksListOpen
      ) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          gotoPrevScene()
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          gotoNextScene()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    immersive,
    activeMode,
    narrative,
    toggleImmersive,
    toggleSidebar,
    gotoPrevScene,
    gotoNextScene,
    searchOpen,
    bookmarksListOpen,
    showContinueHint,
  ])

  // ─── Original mode: scroll position uses scrollYProgress ──────────────────
  // For ORIGINAL mode prev/next: scroll by ~80vh
  const scrollByPage = React.useCallback((dir: 1 | -1) => {
    window.scrollBy({ top: dir * window.innerHeight * 0.8, behavior: 'smooth' })
  }, [])

  // ─── Scene in-view handler (stable — setCurrentSceneIdx is stable) ─────────
  const onSceneInView = React.useCallback((i: number) => {
    setCurrentSceneIdx((cur) => (cur !== i ? i : cur))
  }, [])

  const registerRef = React.useCallback(
    (i: number, el: HTMLElement | null) => {
      sceneRefs.current.set(i, el)
    },
    [],
  )

  // ─── Power-user callbacks ──────────────────────────────────────────────────
  // Derived from the *rendered* narrative's mode so it stays correct after a
  // dual-mode switch (the loaded row — not the originally-opened activeMode).
  const isCinematifiedMode = narrative?.mode === 'CINEMATIFIED'

  // Track current paragraph via scroll (throttled by RAF)
  React.useEffect(() => {
    if (!narrative) return
    let rafId: number | null = null
    // Performance: cache paragraph positions and use binary search instead of
    // a linear scan with getBoundingClientRect on every scroll tick.
    // For a 500-paragraph document this is O(log n) vs O(n) per frame.
    let paraEls: HTMLElement[] = []
    let paraTops: number[] = []
    const rebuildCache = () => {
      paraEls = Array.from(document.querySelectorAll<HTMLElement>('[data-paragraph-idx]'))
      paraTops = paraEls.map((el) => el.getBoundingClientRect().top + window.scrollY)
    }
    rebuildCache()
    const onResize = () => rebuildCache()
    window.addEventListener('resize', onResize)

    const updateParagraph = () => {
      rafId = null
      if (paraTops.length === 0) return
      const viewportTop = window.scrollY + window.innerHeight * 0.25
      // Binary search: paraTops is sorted ascending (document order).
      let lo = 0, hi = paraTops.length - 1
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (paraTops[mid] < viewportTop) lo = mid + 1
        else hi = mid
      }
      // Check if previous paragraph is closer.
      let closestLo = lo
      if (lo > 0 && Math.abs(paraTops[lo - 1] - viewportTop) < Math.abs(paraTops[lo] - viewportTop)) {
        closestLo = lo - 1
      }
      const idx = parseInt(paraEls[closestLo]?.dataset.paragraphIdx || '0', 10)
      setCurrentParagraphIdx((cur) => (cur !== idx ? idx : cur))
    }
    const onScroll = () => {
      if (rafId == null) rafId = requestAnimationFrame(updateParagraph)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    updateParagraph()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      if (rafId != null) cancelAnimationFrame(rafId)
    }
  }, [narrative])

  // Is the current position already bookmarked?
  const isCurrentBookmarked = React.useMemo(() => {
    if (bookmarks.length === 0) return false
    if (isCinematifiedMode) {
      return bookmarks.some((bm) => bm.sceneIndex === currentSceneIdx)
    }
    // Original mode: close to current scroll %
    const currentPct = progress
    return bookmarks.some(
      (bm) => Math.abs((bm.offset || 0) - currentPct) < 3,
    )
  }, [bookmarks, isCinematifiedMode, currentSceneIdx, progress])

  // Toggle bookmark at current position
  const onToggleBookmark = React.useCallback(() => {
    if (!effectiveNarrativeId) return
    // If current pos is already bookmarked, remove it
    if (isCurrentBookmarked) {
      const existing = isCinematifiedMode
        ? bookmarks.find((bm) => bm.sceneIndex === currentSceneIdx)
        : bookmarks.find(
            (bm) => Math.abs((bm.offset || 0) - progress) < 3,
          )
      if (existing) {
        fetch(
          `/api/narratives/${effectiveNarrativeId}/bookmarks?bookmarkId=${existing.id}`,
          { method: 'DELETE' },
        )
          .then(() => {
            refreshBookmarks()
            toast({ title: 'Bookmark removed' })
          })
          .catch(() => {})
      }
      return
    }
    // Add a new bookmark
    const scrollPct = Math.min(100, Math.max(0, Math.round(progress)))
    const sceneIndex = isCinematifiedMode ? currentSceneIdx : null
    const label = isCinematifiedMode && narrative
      ? `Scene ${currentSceneIdx + 1}${
          narrative.scenes[currentSceneIdx]?.title
            ? ` · ${narrative.scenes[currentSceneIdx].title}`
            : ''
        }`
      : `${scrollPct}% through`
    fetch(`/api/narratives/${effectiveNarrativeId}/bookmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sceneIndex,
        paragraphIdx: currentParagraphIdx,
        offset: scrollPct,
        label,
      }),
    })
      .then(() => {
        refreshBookmarks()
        toast({ title: 'Bookmarked', description: label })
      })
      .catch(() => {})
  }, [
    effectiveNarrativeId,
    isCurrentBookmarked,
    isCinematifiedMode,
    bookmarks,
    currentSceneIdx,
    progress,
    narrative,
    currentParagraphIdx,
    refreshBookmarks,
    toast,
  ])

  // Jump to a bookmark
  const onJumpBookmark = React.useCallback(
    (bm: ReaderBookmark) => {
      setBookmarksListOpen(false)
      if (bm.sceneIndex != null && isCinematifiedMode) {
        jumpScene(bm.sceneIndex)
      } else {
        const scrollableHeight =
          document.documentElement.scrollHeight - window.innerHeight
        const targetY = (bm.offset / 100) * Math.max(0, scrollableHeight)
        window.scrollTo({ top: targetY, behavior: 'smooth' })
      }
    },
    [isCinematifiedMode, jumpScene],
  )

  // Delete a bookmark
  const onDeleteBookmark = React.useCallback(
    (id: string) => {
      if (!effectiveNarrativeId) return
      fetch(
        `/api/narratives/${effectiveNarrativeId}/bookmarks?bookmarkId=${id}`,
        { method: 'DELETE' },
      )
        .then(() => {
          refreshBookmarks()
          toast({ title: 'Bookmark deleted' })
        })
        .catch(() => {})
    },
    [effectiveNarrativeId, refreshBookmarks, toast],
  )

  // Search result jump handlers
  const onJumpParagraphFromSearch = React.useCallback((id: string) => {
    const el = document.querySelector(`[data-paragraph-id="${id}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('reader-flash-highlight')
      setTimeout(() => el.classList.remove('reader-flash-highlight'), 2000)
    }
  }, [])

  const onJumpSceneFromSearch = React.useCallback((id: string) => {
    const el = document.querySelector(`[data-scene-id="${id}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  // Jump to an emotional peak by scrolling to its containing scene. Peaks carry
  // a sceneId; we resolve it to the scene's DOM element and scroll there. (The
  // peak's char-offset isn't directly mappable to scroll position, so the scene
  // is the closest faithful anchor — and the peak lives within it.)
  const onJumpPeak = React.useCallback((peak: ReaderPeak) => {
    if (!peak.sceneId) return
    const el = document.querySelector(`[data-scene-id="${peak.sceneId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      el.classList.add('reader-flash-highlight')
      setTimeout(() => el.classList.remove('reader-flash-highlight'), 2000)
    }
  }, [])

  // Continue-reading hint actions
  const onDismissHint = React.useCallback(() => {
    setShowContinueHint(false)
  }, [])

  const onStartOver = React.useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setShowContinueHint(false)
    if (effectiveNarrativeId) {
      fetch(`/api/narratives/${effectiveNarrativeId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scrollPct: 0, sceneIndex: 0, paragraphIdx: 0 }),
      }).catch(() => {})
    }
  }, [effectiveNarrativeId])

  // ─── Empty state ───────────────────────────────────────────────────────────
  if (!narrativeId || !activeMode) {
    return <EmptyState />
  }

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="relative min-h-screen pt-14">
        <LoadingState />
      </div>
    )
  }

  // ─── Error ─────────────────────────────────────────────────────────────────
  if (error || !narrative) {
    return (
      <ErrorState
        onRetry={() => {
          setError(null)
          fetchNarrative()
        }}
      />
    )
  }

  // ─── Loaded ────────────────────────────────────────────────────────────────
  // The rendered narrative's mode is authoritative — after a mode switch the
  // sibling row loads with its own `mode`, and `isCinematified` follows it.
  // (`activeMode` from the store reflects only the originally-opened narrative
  // and is intentionally NOT used here, so toggling updates the layout.)
  const isCinematified = narrative.mode === 'CINEMATIFIED'
  const effectiveMode: ReaderMode = isCinematified ? 'CINEMATIFIED' : 'ORIGINAL'

  return (
    <motion.div
      variants={bookOpen}
      initial="initial"
      animate="animate"
      className="relative"
      style={{ perspective: 1200 }}
    >
      <TopProgressBar progress={smoothProgress} />

      {/* Top bar — visible when (not immersive) OR (immersive + controlsVisible) */}
      <AnimatePresence>
        {(controlsVisible || !immersive) && (
          <TopBar
            title={narrative.title}
            mode={effectiveMode}
            fontSize={fontSize}
            readerTheme={readerTheme}
            immersive={immersive}
            isCurrentBookmarked={isCurrentBookmarked}
            bookmarkCount={bookmarks.length}
            narrativeId={narrative.id}
            onBack={openLibrary}
            onCycleFont={onCycleFont}
            onToggleImmersive={toggleImmersive}
            onToggleTheme={onToggleTheme}
            onOpenCharacters={() =>
              openCharacters(narrative.id, undefined)
            }
            onOpenScenes={() => openScenes(narrative.id, undefined)}
            onOpenSearch={() => setSearchOpen(true)}
            onToggleBookmark={onToggleBookmark}
            onOpenBookmarksList={() => setBookmarksListOpen(true)}
            onCloseBookmarksList={() => setBookmarksListOpen(false)}
            bookmarksListOpen={bookmarksListOpen}
            bookmarks={bookmarks}
            onJumpBookmark={onJumpBookmark}
            onDeleteBookmark={onDeleteBookmark}
            showModeToggle={
              !!(siblingMap.ORIGINAL && siblingMap.CINEMATIFIED)
            }
            desiredMode={desiredMode}
            onSetDesiredMode={setDesiredMode}
            showSidebarToggle={isCinematified}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={toggleSidebar}
          />
        )}
      </AnimatePresence>

      {/* Main content + sidebar */}
      <div
        className={cn(
          'mx-auto flex max-w-7xl gap-6 px-0 pb-32 pt-20',
          immersive ? 'pt-12' : 'pt-20',
        )}
      >
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          {isCinematified ? (
            <CinematifiedReader
              narrative={narrative}
              fontSize={fontSize}
              onSceneInView={onSceneInView}
              registerRef={registerRef}
            />
          ) : (
            <div className="pt-4">
              <OriginalReader narrative={narrative} fontSize={fontSize} />
            </div>
          )}
        </div>

        {/* Sidebar — cinematified + non-immersive + lg+ */}
        {isCinematified && !immersive && (
          <ReaderSidebar
            scenes={narrative.scenes}
            locations={narrative.locations}
            arcs={narrative.arcs ?? []}
            peaks={narrative.peaks ?? []}
            currentSceneIdx={currentSceneIdx}
            onJumpScene={jumpScene}
            onJumpPeak={onJumpPeak}
            bookmarks={bookmarks}
            onJumpBookmark={onJumpBookmark}
            onDeleteBookmark={onDeleteBookmark}
            collapsed={sidebarCollapsed}
          />
        )}

        {/* Collapsed-rail restore button — a thin tab to reopen the explorer.
         *  The reader itself is untouched by this toggle (sibling layout only). */}
        {isCinematified && !immersive && sidebarCollapsed && (
          <motion.button
            type="button"
            onClick={toggleSidebar}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={spring.gentle}
            aria-label="Show explorer"
            className="sticky top-20 hidden h-10 shrink-0 items-center rounded-l-lg border border-amber/15 border-r-0 bg-plum/30 px-1.5 text-amber/70 backdrop-blur-xl transition-colors hover:bg-amber/10 hover:text-amber lg:flex"
          >
            <PanelRightOpen className="h-4 w-4" />
          </motion.button>
        )}
      </div>

      {/* Bottom navigation */}
      <AnimatePresence>
        {(controlsVisible || !immersive) && (
          <BottomNav
            mode={effectiveMode}
            sceneCount={narrative.scenes.length}
            currentSceneIdx={currentSceneIdx}
            onPrev={
              effectiveMode === 'CINEMATIFIED' ? gotoPrevScene : () => scrollByPage(-1)
            }
            onNext={
              effectiveMode === 'CINEMATIFIED' ? gotoNextScene : () => scrollByPage(1)
            }
            progress={progress}
            immersive={immersive}
          />
        )}
      </AnimatePresence>

      {/* Continue reading hint */}
      <AnimatePresence>
        {showContinueHint && savedProgress && (
          <ContinueReadingHint
            progress={savedProgress}
            onDismiss={onDismissHint}
            onStartOver={onStartOver}
          />
        )}
      </AnimatePresence>

      {/* Search overlay */}
      <AnimatePresence>
        {searchOpen && (
          <SearchOverlay
            narrativeId={narrative.id}
            onClose={() => setSearchOpen(false)}
            onJumpParagraph={onJumpParagraphFromSearch}
            onJumpScene={onJumpSceneFromSearch}
          />
        )}
      </AnimatePresence>

      {/* Ambient spotlight for immersive feel */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 0%, oklch(0.82 0.12 75 / 0.06) 0%, transparent 60%)',
        }}
      />
    </motion.div>
  )
}
