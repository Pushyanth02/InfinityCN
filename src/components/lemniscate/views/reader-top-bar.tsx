'use client'

/**
 * Lemniscate — Reader Top Bar
 * ----------------------------------------------------------------------------
 * The fixed reading toolbar: back, title + dual-mode toggle, font-size cycle,
 * theme toggle, explorer entry points, search, bookmark toggle + list, export,
 * sidebar toggle, and immersive toggle. Extracted verbatim from `reader.tsx`
 * to keep the reader view lean; behavior is unchanged.
 */

import * as React from 'react'
import { useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Maximize2,
  Minimize2,
  Users,
  Film,
  Type,
  Minus,
  Plus,
  BookOpen,
  Sun,
  Moon,
  ScrollText,
  Download,
  Search,
  Bookmark,
  BookmarkCheck,
  PanelRight,
  PanelRightOpen,
} from 'lucide-react'

import { type FontSize, type ReaderMode } from '../store'
import { spring } from '@/lib/motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ExportMenu } from './reader-export-menu'
import { BookmarksPopover } from './reader-overlays'
import type { ReaderBookmark } from './reader-types'
import { cn } from '@/lib/utils'

// ─── Top bar ─────────────────────────────────────────────────────────────────

interface TopBarProps {
  title: string
  mode: ReaderMode
  fontSize: FontSize
  readerTheme: 'dark' | 'light'
  immersive: boolean
  isCurrentBookmarked: boolean
  bookmarkCount: number
  narrativeId: string
  onBack: () => void
  onCycleFont: (dir: 1 | -1) => void
  onToggleImmersive: () => void
  onToggleTheme: () => void
  onOpenCharacters: () => void
  onOpenScenes: () => void
  onOpenSearch: () => void
  onToggleBookmark: () => void
  onOpenBookmarksList: () => void
  bookmarksListOpen: boolean
  onCloseBookmarksList: () => void
  bookmarks: ReaderBookmark[]
  onJumpBookmark: (bm: ReaderBookmark) => void
  onDeleteBookmark: (id: string) => void
  // Dual-mode toggle: present only when both sibling narratives exist.
  showModeToggle?: boolean
  desiredMode?: ReaderMode | null
  onSetDesiredMode?: (m: ReaderMode) => void
  // Collapsible explorer sidebar (cinematified only).
  showSidebarToggle?: boolean
  sidebarCollapsed?: boolean
  onToggleSidebar?: () => void
}

export function TopBar({
  title,
  mode,
  fontSize,
  readerTheme,
  immersive,
  isCurrentBookmarked,
  bookmarkCount,
  narrativeId,
  onBack,
  onCycleFont,
  onToggleImmersive,
  onToggleTheme,
  onOpenCharacters,
  onOpenScenes,
  onOpenSearch,
  onToggleBookmark,
  onOpenBookmarksList,
  bookmarksListOpen,
  onCloseBookmarksList,
  bookmarks,
  onJumpBookmark,
  onDeleteBookmark,
  showModeToggle,
  desiredMode,
  onSetDesiredMode,
  showSidebarToggle,
  sidebarCollapsed,
  onToggleSidebar,
}: TopBarProps) {
  const [exportOpen, setExportOpen] = React.useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  const bookmarksRef = useRef<HTMLDivElement>(null)

  // Close popovers on outside click
  React.useEffect(() => {
    if (!exportOpen && !bookmarksListOpen) return
    const handler = (e: MouseEvent) => {
      if (
        exportOpen &&
        exportRef.current &&
        !exportRef.current.contains(e.target as Node)
      ) {
        setExportOpen(false)
      }
      if (
        bookmarksListOpen &&
        bookmarksRef.current &&
        !bookmarksRef.current.contains(e.target as Node)
      ) {
        onCloseBookmarksList()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [exportOpen, bookmarksListOpen, onCloseBookmarksList])

  return (
    <motion.div
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -16, opacity: 0 }}
      transition={spring.gentle}
      className="fixed inset-x-0 top-0 z-50"
    >
      <div className="divider-gold" />
      <div className="glass-strong border-b border-amber/15">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:gap-3 sm:px-6">
          {/* Back */}
          <Button
            onClick={onBack}
            variant="ghost"
            size="icon"
            aria-label="Back to library"
            className="text-slate hover:bg-amber/10 hover:text-amber"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          {/* Title */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="hidden shrink-0 sm:inline-flex">
              {mode === 'CINEMATIFIED' ? (
                <Film className="h-3.5 w-3.5 text-amber/70" />
              ) : (
                <Type className="h-3.5 w-3.5 text-amber/70" />
              )}
            </span>
            <h1
              className="truncate font-serif text-sm font-medium text-ivory sm:text-base"
              title={title}
            >
              {title}
            </h1>
            {showModeToggle && onSetDesiredMode ? (
              // Dual-mode segmented control: switch between sibling narratives.
              // No reprocessing — both already exist; toggle swaps the loaded row.
              <div
                role="tablist"
                aria-label="Reading mode"
                onKeyDown={(e) => {
                  // WAI-ARIA tabs pattern: Arrow Left/Right move between tabs,
                  // activating the new one (automatic activation — two tabs).
                  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
                  e.preventDefault()
                  const cur = desiredMode ?? mode
                  const next: ReaderMode =
                    cur === 'ORIGINAL' ? 'CINEMATIFIED' : 'ORIGINAL'
                  onSetDesiredMode?.(next)
                }}
                className="inline-flex shrink-0 items-center rounded-md border border-amber/20 bg-midnight/50 p-0.5"
              >
                {(['ORIGINAL', 'CINEMATIFIED'] as ReaderMode[]).map((m) => {
                  const active = (desiredMode ?? mode) === m
                  return (
                    <button
                      key={m}
                      role="tab"
                      aria-selected={active}
                      // Roving tabindex: only the active tab is in the tab
                      // sequence; Arrow keys reach the other.
                      tabIndex={active ? 0 : -1}
                      onClick={() => onSetDesiredMode(m)}
                      className={`flex items-center gap-1 rounded-[5px] px-2 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors ${
                        active
                          ? 'bg-amber/20 text-amber'
                          : 'text-slate/70 hover:bg-amber/10 hover:text-amber'
                      }`}
                    >
                      {m === 'CINEMATIFIED' ? (
                        <Film className="h-3 w-3" />
                      ) : (
                        <Type className="h-3 w-3" />
                      )}
                      {m === 'CINEMATIFIED' ? 'Cinema' : 'Original'}
                    </button>
                  )
                })}
              </div>
            ) : (
              <Badge
                variant="outline"
                className="hidden shrink-0 border-amber/30 px-1.5 py-0 text-[10px] font-normal uppercase tracking-wider text-amber/70 md:inline-flex"
              >
                {mode === 'CINEMATIFIED' ? 'Cinema' : 'Original'}
              </Badge>
            )}
          </div>

          {/* Controls */}
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            {/* Font size — hidden on xs */}
            <div className="hidden items-center rounded-md border border-amber/15 bg-midnight/40 sm:flex">
              <Button
                onClick={() => onCycleFont(-1)}
                variant="ghost"
                size="icon"
                aria-label="Decrease font size"
                className="h-8 w-8 rounded-r-none text-slate hover:bg-amber/10 hover:text-amber"
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <span className="px-1 font-mono text-[10px] uppercase tracking-wider text-amber/60">
                {fontSize}
              </span>
              <Button
                onClick={() => onCycleFont(1)}
                variant="ghost"
                size="icon"
                aria-label="Increase font size"
                className="h-8 w-8 rounded-l-none text-slate hover:bg-amber/10 hover:text-amber"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {/* Font size — icon-only on mobile */}
            <Button
              onClick={() => onCycleFont(1)}
              variant="ghost"
              size="icon"
              aria-label="Cycle font size"
              className="h-9 w-9 text-slate hover:bg-amber/10 hover:text-amber sm:hidden"
            >
              <Type className="h-4 w-4" />
            </Button>

            {/* Theme toggle */}
            <Button
              onClick={onToggleTheme}
              variant="ghost"
              size="icon"
              aria-label={
                readerTheme === 'dark' ? 'Switch to light' : 'Switch to dark'
              }
              className="h-9 w-9 text-slate hover:bg-amber/10 hover:text-amber"
            >
              {readerTheme === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>

            {/* Explorer: Characters */}
            <Button
              onClick={onOpenCharacters}
              variant="ghost"
              size="icon"
              aria-label="Open characters"
              className="hidden h-9 w-9 text-slate hover:bg-amber/10 hover:text-amber sm:inline-flex"
            >
              <Users className="h-4 w-4" />
            </Button>

            {/* Explorer: Scenes (cinematified only) */}
            {mode === 'CINEMATIFIED' && (
              <Button
                onClick={onOpenScenes}
                variant="ghost"
                size="icon"
                aria-label="Open scenes explorer"
                className="hidden h-9 w-9 text-slate hover:bg-amber/10 hover:text-amber sm:inline-flex"
              >
                <ScrollText className="h-4 w-4" />
              </Button>
            )}

            {/* Divider */}
            <span
              className="mx-0.5 hidden h-5 w-px bg-amber/15 sm:inline-block"
              aria-hidden="true"
            />

            {/* Search (Cmd/Ctrl+K) */}
            <Button
              onClick={onOpenSearch}
              variant="ghost"
              size="icon"
              aria-label="Search (Cmd+K)"
              aria-keyshortcuts="Meta+K Ctrl+K"
              className="h-9 w-9 text-slate hover:bg-amber/10 hover:text-amber"
            >
              <Search className="h-4 w-4" />
            </Button>

            {/* Bookmark toggle */}
            <Button
              onClick={onToggleBookmark}
              variant="ghost"
              size="icon"
              aria-label={
                isCurrentBookmarked
                  ? 'Remove bookmark at current position'
                  : 'Bookmark current position'
              }
              className={cn(
                'relative h-9 w-9 transition-colors',
                isCurrentBookmarked
                  ? 'text-amber hover:bg-amber/15'
                  : 'text-slate hover:bg-amber/10 hover:text-amber',
              )}
            >
              <AnimatePresence mode="wait" initial={false}>
                {isCurrentBookmarked ? (
                  <motion.span
                    key="check"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    transition={spring.bouncy}
                  >
                    <BookmarkCheck className="h-4 w-4" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="plain"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    transition={spring.bouncy}
                  >
                    <Bookmark className="h-4 w-4" />
                  </motion.span>
                )}
              </AnimatePresence>
              {bookmarkCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-plum bg-amber px-0.5 font-mono text-[8px] font-bold text-midnight">
                  {bookmarkCount > 9 ? '9+' : bookmarkCount}
                </span>
              )}
            </Button>

            {/* Bookmarks list dropdown — hidden on lg+ when sidebar shows it (cinematified only, non-immersive) */}
            <div
              ref={bookmarksRef}
              className={cn(
                'relative',
                mode === 'CINEMATIFIED' && !immersive && 'lg:hidden',
              )}
            >
              <Button
                onClick={() =>
                  bookmarksListOpen
                    ? onCloseBookmarksList()
                    : onOpenBookmarksList()
                }
                variant="ghost"
                size="icon"
                aria-label="View all bookmarks"
                className="h-9 w-9 text-slate hover:bg-amber/10 hover:text-amber"
              >
                <BookOpen className="h-4 w-4" />
              </Button>
              <AnimatePresence>
                {bookmarksListOpen && (
                  <BookmarksPopover
                    bookmarks={bookmarks}
                    onJump={onJumpBookmark}
                    onDelete={onDeleteBookmark}
                    onClose={onCloseBookmarksList}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Export */}
            <div ref={exportRef} className="relative">
              <Button
                onClick={() => setExportOpen((v) => !v)}
                variant="ghost"
                size="icon"
                aria-label="Export narrative"
                aria-expanded={exportOpen}
                className="h-9 w-9 text-slate hover:bg-amber/10 hover:text-amber"
              >
                <Download className="h-4 w-4" />
              </Button>
              <AnimatePresence>
                {exportOpen && (
                  <ExportMenu
                    narrativeId={narrativeId}
                    onClose={() => setExportOpen(false)}
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Explorer sidebar toggle (cinematified only) — `[` keyboard shortcut */}
            {showSidebarToggle && onToggleSidebar && (
              <Button
                onClick={onToggleSidebar}
                variant="ghost"
                size="icon"
                aria-label={
                  sidebarCollapsed ? 'Show explorer sidebar' : 'Hide explorer sidebar'
                }
                aria-pressed={!sidebarCollapsed}
                title={`${sidebarCollapsed ? 'Show' : 'Hide'} explorer ( [ )`}
                className={cn(
                  'h-9 w-9 hover:bg-amber/15',
                  sidebarCollapsed
                    ? 'text-slate hover:text-amber'
                    : 'text-amber hover:text-amber',
                )}
              >
                {sidebarCollapsed ? (
                  <PanelRightOpen className="h-4 w-4" />
                ) : (
                  <PanelRight className="h-4 w-4" />
                )}
              </Button>
            )}

            {/* Immersive toggle */}
            <Button
              onClick={onToggleImmersive}
              variant="ghost"
              size="icon"
              aria-label={immersive ? 'Exit immersive' : 'Enter immersive'}
              className="h-9 w-9 text-amber hover:bg-amber/15 hover:text-amber"
            >
              {immersive ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
