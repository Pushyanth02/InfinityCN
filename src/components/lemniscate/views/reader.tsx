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
  useInView,
  useScroll,
  useSpring,
  useMotionValueEvent,
  type MotionValue,
} from 'framer-motion'
import {
  ArrowLeft,
  Maximize2,
  Minimize2,
  Users,
  Film,
  Type,
  Minus,
  Plus,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RotateCcw,
  BookOpen,
  Library,
  Sun,
  Moon,
  ScrollText,
  Download,
  Search,
  Bookmark,
  BookmarkCheck,
  Trash2,
  X,
  FileText,
  FileDown,
  Loader2,
} from 'lucide-react'

import {
  useLemniscate,
  type FontSize,
  type ReaderMode,
  type LineHeight,
  type FontFamily,
  type ReaderWidth,
} from '../store'
import { InfinityFlow, Flourish } from '../logo'
import {
  bookOpen,
  sceneTransition,
  revealBlur,
  staggerContainer,
  staggerFast,
  hoverLift,
  spring,
} from '@/lib/motion'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

type ParagraphType =
  | 'NARRATION'
  | 'DIALOGUE'
  | 'ACTION'
  | 'TRANSITION'
  | 'HEADING'
  | 'THOUGHT'

interface ReaderParagraph {
  id: string
  index: number
  text: string
  type: ParagraphType
  speaker?: string | null
  wordCount: number
}

interface ReaderEvent {
  id: string
  index: number
  type: string
  description: string
  participants?: string
  intensity?: number
}

interface ReaderScene {
  id: string
  index: number
  title: string
  summary: string
  heading?: string | null
  location?: string | null
  timeOfDay?: string | null
  mood?: string | null
  tensionScore: number
  emotionScore: number
  dominantEmotion?: string | null
  dialogueRatio: number
  eventCount: number
  paragraphs: ReaderParagraph[]
  events: ReaderEvent[]
}

interface ReaderCharacter {
  id: string
  name: string
  role: string
  mentions: number
  dialogueLines: number
}

interface ReaderLocation {
  id: string
  name: string
  type: string
  mentions: number
}

interface ReaderNarrative {
  id: string
  title: string
  mode: ReaderMode
  wordCount: number
  readingTimeMin: number
  paragraphs: ReaderParagraph[]
  scenes: ReaderScene[]
  characters: ReaderCharacter[]
  locations: ReaderLocation[]
  metadata?: string
}

// ─── Reader-power-user types ────────────────────────────────────────────────

interface ReaderBookmark {
  id: string
  narrativeId: string
  sceneIndex: number | null
  paragraphIdx: number | null
  offset: number
  label: string | null
  note: string | null
  createdAt: string
}

interface ReaderProgress {
  scrollPct: number
  sceneIndex: number
  paragraphIdx: number
}

interface ReaderSearchResult {
  type: 'paragraph' | 'scene' | 'character'
  refId: string
  title: string
  snippet: string
  matchCount: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FONT_SIZE_PX: Record<FontSize, number> = {
  sm: 17,
  md: 18, // 1.125rem — matches .text-reader-body default
  lg: 20,
  xl: 23,
}

const FONT_SIZE_ORDER: FontSize[] = ['sm', 'md', 'lg', 'xl']

const LINE_HEIGHT: Record<LineHeight, number> = {
  compact: 1.55,
  normal: 1.8,
  relaxed: 2.05,
}

const FONT_FAMILY: Record<FontFamily, string> = {
  serif: 'var(--font-reader)',
  sans: 'var(--font-sans-stack)',
}

const READER_MAX_WIDTH: Record<ReaderWidth, string> = {
  narrow: '32rem',
  medium: '38rem',
  wide: '46rem',
}

/** Hook: resolve the reader's typography/layout preferences into inline styles. */
function useReaderTypography(): {
  lineHeight: number
  fontFamily: string
  maxWidth: string
} {
  const lineHeight = useLemniscate((s) => s.readerLineHeight)
  const fontFamily = useLemniscate((s) => s.readerFontFamily)
  const width = useLemniscate((s) => s.readerWidth)
  return {
    lineHeight: LINE_HEIGHT[lineHeight],
    fontFamily: FONT_FAMILY[fontFamily],
    maxWidth: READER_MAX_WIDTH[width],
  }
}

/** Debounce a value — used for search input and progress saves. */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState<T>(value)
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

/** Highlight `query` inside `text` with amber markup. */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  const out: React.ReactNode[] = []
  let i = 0
  let key = 0
  while (i < text.length) {
    const idx = lower.indexOf(q, i)
    if (idx === -1) {
      out.push(<React.Fragment key={key++}>{text.slice(i)}</React.Fragment>)
      break
    }
    if (idx > i) {
      out.push(<React.Fragment key={key++}>{text.slice(i, idx)}</React.Fragment>)
    }
    out.push(
      <mark
        key={key++}
        className="rounded bg-amber/25 px-0.5 text-amber not-italic"
      >
        {text.slice(idx, idx + q.length)}
      </mark>,
    )
    i = idx + q.length
  }
  return <>{out}</>
}

/** Build an `INT./EXT. LOCATION — TIME` heading from scene fields. */
function buildSceneHeading(
  scene: ReaderScene,
  locations: ReaderLocation[],
): string {
  if (scene.heading && scene.heading.trim()) return scene.heading
  const locName = scene.location?.trim()
  const locType = locName
    ? locations.find(
        (l) =>
          l.name.toLowerCase() === locName.toLowerCase() ||
          locName.toLowerCase().includes(l.name.toLowerCase()) ||
          l.name.toLowerCase().includes(locName.toLowerCase()),
      )?.type
    : undefined
  const prefix =
    locType === 'INDOOR' || locType === 'VEHICLE'
      ? 'INT.'
      : locType === 'OUTDOOR' || locType === 'URBAN' || locType === 'NATURE'
        ? 'EXT.'
        : '—'
  const loc = locName ? locName.toUpperCase() : 'UNKNOWN LOCATION'
  const tod = scene.timeOfDay || 'CONTINUOUS'
  return `${prefix} ${loc} — ${tod}`
}

// ─── Empty / Loading / Error states ──────────────────────────────────────────

function EmptyState() {
  const openLibrary = useLemniscate((s) => s.openLibrary)
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6 py-20">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring.gentle, duration: 0.7 }}
        className="text-center"
      >
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-amber/20 bg-plum/30 text-amber/60">
          <BookOpen className="h-9 w-9" />
        </div>
        <h2 className="text-headline text-ivory">No narrative selected</h2>
        <p className="mx-auto mt-3 max-w-md text-pretty text-sm text-slate">
          Select a narrative from your library and the reader will open it here,
          beautifully typeset.
        </p>
        <motion.div {...hoverLift} className="mt-6 inline-block">
          <Button
            onClick={openLibrary}
            variant="outline"
            className="border-amber/30 text-amber hover:bg-amber/10 hover:text-amber"
          >
            <Library className="h-4 w-4" />
            Open Library
          </Button>
        </motion.div>
      </motion.div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <div className="flex flex-col items-center gap-5 pb-16 text-center">
        <InfinityFlow className="h-12 w-24 text-amber" />
        <div className="space-y-1">
          <p className="font-serif text-ivory">Opening narrative…</p>
          <p className="text-xs uppercase tracking-[0.3em] text-amber/50">
            Lemniscate Reader
          </p>
        </div>
      </div>
      <div className="space-y-6">
        <Skeleton className="h-10 w-2/3 rounded-lg bg-amber/10" />
        <Skeleton className="h-4 w-1/3 bg-amber/5" />
        <div className="my-8 flex justify-center">
          <Flourish className="h-3 w-32 text-amber/30" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton
              className="h-4 w-full rounded bg-amber/5"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
            <Skeleton
              className="h-4 w-[94%] rounded bg-amber/5"
              style={{ animationDelay: `${i * 0.15 + 0.05}s` }}
            />
            <Skeleton
              className="h-4 w-[88%] rounded bg-amber/5"
              style={{ animationDelay: `${i * 0.15 + 0.1}s` }}
            />
          </div>
        ))}
        <div className="flex justify-center pt-6">
          <Skeleton className="h-4 w-24 rounded bg-amber/10" />
        </div>
      </div>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const openLibrary = useLemniscate((s) => s.openLibrary)
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6 py-20">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={spring.gentle}
      >
        <Card className="max-w-md border-tension/30 bg-plum/20 p-8 text-center shadow-cinema">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-tension/40 bg-tension/10 text-tension">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h2 className="text-title text-ivory">Could not open narrative</h2>
          <p className="mt-2 text-sm text-slate">
            The narrative may have been removed, or the request failed. You can
            try again, or return to your library.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <motion.div {...hoverLift}>
              <Button
                onClick={onRetry}
                className="bg-amber text-midnight hover:bg-amber/90"
              >
                <RotateCcw className="h-4 w-4" />
                Retry
              </Button>
            </motion.div>
            <motion.div {...hoverLift}>
              <Button
                onClick={openLibrary}
                variant="outline"
                className="border-amber/30 text-amber hover:bg-amber/10"
              >
                <Library className="h-4 w-4" />
                Library
              </Button>
            </motion.div>
          </div>
        </Card>
      </motion.div>
    </div>
  )
}

// ─── Export menu (Notion-style) ──────────────────────────────────────────────

interface ExportMenuProps {
  narrativeId: string
  onClose: () => void
}

function ExportMenu({ narrativeId, onClose }: ExportMenuProps) {
  const options: Array<{
    format: 'markdown' | 'pdf' | 'epub'
    label: string
    desc: string
    Icon: typeof FileText
  }> = [
    {
      format: 'markdown',
      label: 'Markdown',
      desc: 'Plain text · .md',
      Icon: FileText,
    },
    {
      format: 'pdf',
      label: 'Printable',
      desc: 'HTML · print to PDF',
      Icon: FileDown,
    },
    {
      format: 'epub',
      label: 'EPUB',
      desc: 'E-reader · .epub',
      Icon: BookOpen,
    },
  ]
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: -4 }}
      transition={spring.snappy}
      className="absolute right-0 top-full z-50 mt-2 w-64 origin-top-right rounded-xl border border-amber/20 bg-plum/95 p-1.5 shadow-cinema backdrop-blur-2xl"
      role="menu"
      aria-label="Export narrative"
    >
      <div className="flex items-center justify-between px-2 py-1.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber/60">
          Export
        </p>
        <button
          onClick={onClose}
          aria-label="Close export menu"
          className="text-slate transition-colors hover:text-amber"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {options.map(({ format, label, desc, Icon }) => (
        <button
          key={format}
          role="menuitem"
          onClick={() => {
            window.open(
              `/api/narratives/${narrativeId}/export?format=${format}`,
              '_blank',
              'noopener,noreferrer',
            )
            onClose()
          }}
          className="group flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-amber/10"
        >
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-amber/70 transition-colors group-hover:text-amber" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ivory">{label}</p>
            <p className="text-[11px] text-slate">{desc}</p>
          </div>
          <Download className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber/40 opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      ))}
      <div className="mt-1 border-t border-amber/10 px-2 pt-1.5">
        <p className="text-[10px] italic text-slate/70">
          Generated deterministically · offline
        </p>
      </div>
    </motion.div>
  )
}

// ─── Bookmarks popover (dropdown list + jump/delete) ─────────────────────────

interface BookmarksPopoverProps {
  bookmarks: ReaderBookmark[]
  onJump: (bm: ReaderBookmark) => void
  onDelete: (id: string) => void
  onClose: () => void
}

function BookmarksPopover({
  bookmarks,
  onJump,
  onDelete,
  onClose,
}: BookmarksPopoverProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: -4 }}
      transition={spring.snappy}
      className="absolute right-0 top-full z-50 mt-2 w-80 origin-top-right rounded-xl border border-amber/20 bg-plum/95 shadow-cinema backdrop-blur-2xl"
      role="dialog"
      aria-label="Bookmarks"
    >
      <div className="flex items-center justify-between border-b border-amber/15 px-3 py-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber/60">
          Bookmarks · {bookmarks.length}
        </p>
        <button
          onClick={onClose}
          aria-label="Close bookmarks"
          className="text-slate transition-colors hover:text-amber"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto scrollbar-lemniscate p-1">
        {bookmarks.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <Bookmark className="mx-auto mb-2 h-6 w-6 text-amber/30" />
            <p className="text-xs text-slate">
              No bookmarks yet.
            </p>
            <p className="mt-1 text-[11px] text-slate/70">
              Click the bookmark icon in the top bar to save a position.
            </p>
          </div>
        ) : (
          bookmarks.map((bm) => (
            <div
              key={bm.id}
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-amber/10"
            >
              <Bookmark className="h-3.5 w-3.5 shrink-0 text-amber/70" />
              <button
                onClick={() => onJump(bm)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-xs font-medium text-ivory">
                  {bm.label ||
                    (bm.sceneIndex != null
                      ? `Scene ${bm.sceneIndex + 1}`
                      : 'Position')}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-wide text-amber/50">
                  {Math.round(bm.offset)}%
                  {bm.sceneIndex != null ? ` · Scene ${bm.sceneIndex + 1}` : ''}
                  {bm.note ? ` · ${bm.note.slice(0, 40)}` : ''}
                </p>
              </button>
              <button
                onClick={() => onDelete(bm.id)}
                aria-label="Delete bookmark"
                className="shrink-0 text-slate opacity-0 transition-all hover:text-tension group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </motion.div>
  )
}

// ─── Search overlay (Linear-style command palette) ───────────────────────────

interface SearchOverlayProps {
  narrativeId: string
  onClose: () => void
  onJumpParagraph: (id: string) => void
  onJumpScene: (id: string) => void
}

function SearchOverlay({
  narrativeId,
  onClose,
  onJumpParagraph,
  onJumpScene,
}: SearchOverlayProps) {
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<ReaderSearchResult[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debouncedQuery = useDebouncedValue(query, 300)

  // Auto-focus on mount
  React.useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [])

  // Lock body scroll while overlay is open
  React.useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Debounced search
  React.useEffect(() => {
    const q = debouncedQuery.trim()
    if (q.length < 2) {
      setResults([])
      setTotal(0)
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    fetch(
      `/api/narratives/${narrativeId}/search?q=${encodeURIComponent(q)}`,
      { signal: controller.signal },
    )
      .then((r) => r.json())
      .then((data) => {
        setResults((data.results as ReaderSearchResult[]) || [])
        setTotal(data.total || 0)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setLoading(false)
      })
    return () => controller.abort()
  }, [debouncedQuery, narrativeId])

  const grouped = React.useMemo(() => {
    const g: Record<ReaderSearchResult['type'], ReaderSearchResult[]> = {
      paragraph: [],
      scene: [],
      character: [],
    }
    results.forEach((r) => {
      g[r.type].push(r)
    })
    return g
  }, [results])

  const handleResultClick = (r: ReaderSearchResult) => {
    onClose()
    // Wait for overlay close animation before scrolling
    setTimeout(() => {
      if (r.type === 'paragraph') onJumpParagraph(r.refId)
      else if (r.type === 'scene') onJumpScene(r.refId)
    }, 220)
  }

  const typeMeta: Record<
    ReaderSearchResult['type'],
    { label: string; Icon: typeof FileText }
  > = {
    paragraph: { label: 'Paragraphs', Icon: FileText },
    scene: { label: 'Scenes', Icon: Film },
    character: { label: 'Characters', Icon: Users },
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[80] flex items-start justify-center bg-midnight/80 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Search narrative"
    >
      <motion.div
        initial={{ y: -24, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: -16, opacity: 0, scale: 0.98 }}
        transition={spring.gentle}
        onClick={(e) => e.stopPropagation()}
        className="mx-4 mt-[10vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-amber/20 bg-plum/95 shadow-cinema backdrop-blur-2xl"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-amber/15 px-4 py-3.5">
          <Search className="h-5 w-5 shrink-0 text-amber/70" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search paragraphs, scenes, characters…"
            className="min-w-0 flex-1 bg-transparent text-base text-ivory placeholder:text-slate/60 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
              }
            }}
          />
          {loading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber/60" />
          ) : (
            <kbd className="hidden shrink-0 rounded border border-amber/20 bg-midnight/50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber/60 sm:inline-block">
              ESC
            </kbd>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto scrollbar-lemniscate">
          {query.trim().length < 2 ? (
            <div className="px-4 py-14 text-center">
              <Search className="mx-auto mb-3 h-8 w-8 text-amber/30" />
              <p className="text-sm text-slate">
                Type at least 2 characters to search
              </p>
              <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-amber/40">
                Paragraphs · Scenes · Characters
              </p>
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="px-4 py-14 text-center">
              <p className="text-sm text-slate">
                No results for{' '}
                <span className="text-amber">“{query}”</span>
              </p>
              <p className="mt-1.5 text-[11px] text-slate/70">
                Try a different word or phrase
              </p>
            </div>
          ) : (
            <div className="p-2">
              {(['paragraph', 'scene', 'character'] as const).map((type) => {
                const items = grouped[type]
                if (items.length === 0) return null
                const { label, Icon } = typeMeta[type]
                return (
                  <div key={type} className="mb-1.5">
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <Icon className="h-3.5 w-3.5 text-amber/60" />
                      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber/60">
                        {label}
                      </p>
                      <span className="ml-auto text-[10px] text-slate">
                        {items.length}
                      </span>
                    </div>
                    {items.map((r) => (
                      <button
                        key={r.refId + r.type}
                        onClick={() => handleResultClick(r)}
                        className="group flex w-full flex-col gap-1 rounded-lg px-2 py-2 text-left transition-colors hover:bg-amber/10"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-ivory">
                            {r.title}
                          </span>
                          {r.matchCount > 1 && (
                            <Badge
                              variant="outline"
                              className="border-amber/30 px-1.5 py-0 text-[9px] text-amber/70"
                            >
                              ×{r.matchCount}
                            </Badge>
                          )}
                          <ChevronRight className="ml-auto h-3.5 w-3.5 text-amber/40 opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                        <p className="line-clamp-2 text-[12px] italic leading-relaxed text-slate">
                          <HighlightMatch text={r.snippet} query={query} />
                        </p>
                      </button>
                    ))}
                  </div>
                )
              })}
              {total > results.length && (
                <p className="mt-1 px-2 py-1.5 text-center text-[11px] text-slate">
                  Showing {results.length} of {total} matches — refine your
                  query to narrow further
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-amber/15 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-amber/50">
          <span className="hidden sm:inline">Click result to jump</span>
          <span className="sm:hidden">Tap result to jump</span>
          <span>esc to close</span>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Continue reading hint (post-restore banner) ─────────────────────────────

interface ContinueReadingHintProps {
  progress: ReaderProgress
  onDismiss: () => void
  onStartOver: () => void
}

function ContinueReadingHint({
  progress,
  onDismiss,
  onStartOver,
}: ContinueReadingHintProps) {
  React.useEffect(() => {
    const t = setTimeout(onDismiss, 7000)
    return () => clearTimeout(t)
  }, [onDismiss])
  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={spring.gentle}
      className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 px-4"
    >
      <div className="glass-strong flex items-center gap-3 rounded-full border border-amber/25 py-2 pl-4 pr-2 shadow-cinema">
        <BookOpen className="h-4 w-4 shrink-0 text-amber" />
        <p className="text-sm text-ivory">
          Resumed at{' '}
          <span className="font-medium text-amber">
            {Math.round(progress.scrollPct)}%
          </span>
          {progress.sceneIndex > 0 && (
            <>
              {' '}
              · Scene{' '}
              <span className="font-medium text-amber">
                {progress.sceneIndex + 1}
              </span>
            </>
          )}
        </p>
        <button
          onClick={onStartOver}
          className="ml-1 shrink-0 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-slate transition-colors hover:bg-amber/10 hover:text-amber"
        >
          Start over
        </button>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-1 text-slate transition-colors hover:bg-amber/10 hover:text-amber"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  )
}

// ─── Top progress bar ─────────────────────────────────────────────────────────

function TopProgressBar({ progress }: { progress: MotionValue<number> }) {
  // progress is a 0..1 MotionValue — animated via spring for smoothness.
  return (
    <div
      className="fixed inset-x-0 top-0 z-[60] h-[3px] bg-transparent"
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
}

function TopBar({
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
            <Badge
              variant="outline"
              className="hidden shrink-0 border-amber/30 px-1.5 py-0 text-[10px] font-normal uppercase tracking-wider text-amber/70 md:inline-flex"
            >
              {mode === 'CINEMATIFIED' ? 'Cinema' : 'Original'}
            </Badge>
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

// ─── Paragraph rendering (ORIGINAL mode) ─────────────────────────────────────

function ParagraphBlock({ p }: { p: ReaderParagraph }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px -10% 0px' })

  const content = (() => {
    switch (p.type) {
      case 'HEADING':
        return <h2>{p.text}</h2>
      case 'DIALOGUE':
        return (
          <blockquote>
            {p.speaker && (
              <span className="mb-1 block font-sans text-[11px] uppercase not-italic tracking-[0.2em] text-amber/60">
                {p.speaker}
              </span>
            )}
            {p.text}
          </blockquote>
        )
      case 'TRANSITION':
        return (
          <p className="text-center italic text-slate/80">{p.text}</p>
        )
      case 'THOUGHT':
        return <p className="italic text-slate/85">{p.text}</p>
      case 'ACTION':
        return <p style={{ marginBottom: '1.2em' }}>{p.text}</p>
      case 'NARRATION':
      default:
        return <p>{p.text}</p>
    }
  })()

  return (
    <motion.div
      ref={ref}
      variants={revealBlur}
      initial="initial"
      animate={inView ? 'animate' : 'initial'}
      data-paragraph-id={p.id}
      data-paragraph-idx={p.index}
    >
      {content}
    </motion.div>
  )
}

// ─── ORIGINAL mode reader ────────────────────────────────────────────────────

function OriginalReader({
  narrative,
  fontSize,
}: {
  narrative: ReaderNarrative
  fontSize: FontSize
}) {
  const { lineHeight, fontFamily, maxWidth } = useReaderTypography()
  return (
    <motion.article
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="reader-canvas"
      style={{ fontSize: `${FONT_SIZE_PX[fontSize]}px`, lineHeight, fontFamily, maxWidth }}
    >
      {/* Title block */}
      <motion.header
        variants={revealBlur}
        className="mb-12 text-center"
      >
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.3em] text-amber/60">
          Original Mode
        </p>
        <h1 className="text-display text-amber-gradient">{narrative.title}</h1>
        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-slate">
          <span>{narrative.wordCount.toLocaleString()} words</span>
          <span className="text-amber/30">·</span>
          <span>{narrative.readingTimeMin} min read</span>
          <span className="text-amber/30">·</span>
          <span>{narrative.paragraphs.length} paragraphs</span>
        </div>
        <div className="mt-6 flex justify-center">
          <Flourish className="h-3 w-32 text-amber/40" />
        </div>
      </motion.header>

      {narrative.paragraphs.map((p) => (
        <ParagraphBlock key={p.id} p={p} />
      ))}

      <motion.div
        variants={revealBlur}
        className="mt-16 flex flex-col items-center gap-3 text-center"
      >
        <Flourish className="h-3 w-40 text-amber/30" />
        <p className="font-serif text-sm italic text-slate">The End</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-amber/40">
          Lemniscate · {narrative.wordCount.toLocaleString()} words
        </p>
      </motion.div>
    </motion.article>
  )
}

// ─── Scene cinematic rendering (CINEMATIFIED mode) ───────────────────────────

interface SceneCinematicProps {
  scene: ReaderScene
  locations: ReaderLocation[]
  fontSize: FontSize
  onSceneInView: (index: number) => void
  registerRef: (index: number, el: HTMLElement | null) => void
}

function SceneCinematic({
  scene,
  locations,
  fontSize,
  onSceneInView,
  registerRef,
}: SceneCinematicProps) {
  const ref = useRef<HTMLElement>(null)
  // Active-scene tracking: fires when this scene crosses the middle of the viewport.
  const inView = useInView(ref, { margin: '-40% 0px -40% 0px' })
  // Reveal-once: the scene animates in the first time it scrolls into view.
  const inViewOnce = useInView(ref, { once: true, margin: '-10% 0px -10% 0px' })

  React.useEffect(() => {
    if (inView) onSceneInView(scene.index)
  }, [inView, scene.index, onSceneInView])

  React.useEffect(() => {
    registerRef(scene.index, ref.current)
    return () => registerRef(scene.index, null)
  }, [scene.index, registerRef])

  const heading = buildSceneHeading(scene, locations)
  const { lineHeight, fontFamily } = useReaderTypography()

  return (
    <motion.section
      ref={ref}
      variants={sceneTransition}
      initial="initial"
      animate={inViewOnce ? 'animate' : 'initial'}
      className="relative scroll-mt-24"
      data-scene-index={scene.index}
      data-scene-id={scene.id}
    >
      <div>
        {/* Scene heading — monospace, uppercase, centered, amber */}
        <motion.div
          variants={revealBlur}
          className="scene-heading"
        >
          {heading}
        </motion.div>

        {/* Scene title */}
        <motion.div
          variants={revealBlur}
          className="mb-8 mt-2 text-center"
        >
          <h3 className="text-title text-ivory">{scene.title}</h3>
        </motion.div>

        {/* Scene summary — italic, muted, gold left border */}
        {scene.summary && (
          <motion.blockquote
            variants={revealBlur}
            className="mx-auto mb-10 max-w-2xl border-l-2 border-amber/40 bg-plum/20 px-5 py-3 text-center italic text-slate"
          >
            {scene.summary}
          </motion.blockquote>
        )}

        {/* Paragraphs — type-specific cinematic styling */}
        <motion.div
          variants={staggerFast}
          className="reader-canvas space-y-1"
          style={{ fontSize: `${FONT_SIZE_PX[fontSize]}px`, lineHeight, fontFamily }}
        >
          {scene.paragraphs.length === 0 && (
            <p className="text-center italic text-slate/70">
              [No source text recovered for this scene.]
            </p>
          )}
          {scene.paragraphs.map((p) => {
            if (p.type === 'DIALOGUE') {
              return (
                <motion.div
                  key={p.id}
                  variants={revealBlur}
                  className="my-5 text-center"
                  data-paragraph-id={p.id}
                  data-paragraph-idx={p.index}
                >
                  {p.speaker && (
                    <p className="mb-1 font-mono text-xs uppercase tracking-[0.25em] text-amber/80">
                      {p.speaker}
                    </p>
                  )}
                  <p className="mx-auto max-w-xl italic text-ivory/90">
                    {p.text}
                  </p>
                </motion.div>
              )
            }
            if (p.type === 'HEADING') {
              return (
                <motion.p
                  key={p.id}
                  variants={revealBlur}
                  className="mt-6 text-center font-serif text-base text-amber"
                  data-paragraph-id={p.id}
                  data-paragraph-idx={p.index}
                >
                  {p.text}
                </motion.p>
              )
            }
            if (p.type === 'TRANSITION') {
              return (
                <motion.p
                  key={p.id}
                  variants={revealBlur}
                  className="my-4 text-center italic text-slate/70"
                  data-paragraph-id={p.id}
                  data-paragraph-idx={p.index}
                >
                  {p.text}
                </motion.p>
              )
            }
            if (p.type === 'THOUGHT') {
              return (
                <motion.p
                  key={p.id}
                  variants={revealBlur}
                  className="my-3 italic text-slate/85"
                  data-paragraph-id={p.id}
                  data-paragraph-idx={p.index}
                >
                  {p.text}
                </motion.p>
              )
            }
            if (p.type === 'ACTION') {
              return (
                <motion.p
                  key={p.id}
                  variants={revealBlur}
                  className="my-3 pl-4 text-ivory/90"
                  data-paragraph-id={p.id}
                  data-paragraph-idx={p.index}
                >
                  {p.text}
                </motion.p>
              )
            }
            // NARRATION
            return (
              <motion.p
                key={p.id}
                variants={revealBlur}
                className="my-3"
                data-paragraph-id={p.id}
                data-paragraph-idx={p.index}
              >
                {p.text}
              </motion.p>
            )
          })}
        </motion.div>

      </div>
    </motion.section>
  )
}

// ─── Scene separator (between scenes) ────────────────────────────────────────

function SceneSeparator() {
  return (
    <div className="scene-separator" aria-hidden="true">
      <Flourish className="h-3 w-28 text-amber/40" />
    </div>
  )
}

// ─── CINEMATIFIED reader ─────────────────────────────────────────────────────

function CinematifiedReader({
  narrative,
  fontSize,
  onSceneInView,
  registerRef,
}: {
  narrative: ReaderNarrative
  fontSize: FontSize
  onSceneInView: (i: number) => void
  registerRef: (i: number, el: HTMLElement | null) => void
}) {
  const { maxWidth } = useReaderTypography()
  return (
    <motion.article
      variants={bookOpen}
      initial="initial"
      animate="animate"
      className="mx-auto w-full px-4 pb-32 pt-8 sm:px-6"
      style={{ maxWidth }}
    >
      {/* Title block */}
      <motion.header variants={revealBlur} className="mb-16 text-center">
        <p className="mb-3 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.3em] text-amber/60">
          <Film className="h-3.5 w-3.5" />
          Cinematified
        </p>
        <h1 className="text-display text-amber-gradient">
          {narrative.title}
        </h1>
        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-slate">
          <span>{narrative.readingTimeMin} min read</span>
        </div>
        <div className="mt-6 flex justify-center">
          <Flourish className="h-3 w-40 text-amber/40" />
        </div>
      </motion.header>

      {/* Disclaimer */}
      <motion.p
        variants={revealBlur}
        className="mx-auto mb-16 max-w-xl text-center text-[11px] italic leading-relaxed text-slate/70"
      >
        Cinematified reconstruction — all narrative text is sourced verbatim
        from the original document. Structural annotations are generated by
        deterministic heuristics. No content was invented.
      </motion.p>

      {narrative.scenes.length === 0 && (
        <p className="text-center italic text-slate">
          No scenes were detected in this narrative.
        </p>
      )}

      {narrative.scenes.map((scene, i) => (
        <React.Fragment key={scene.id}>
          <SceneCinematic
            scene={scene}
            locations={narrative.locations}
            fontSize={fontSize}
            onSceneInView={onSceneInView}
            registerRef={registerRef}
          />
          {i < narrative.scenes.length - 1 && <SceneSeparator />}
        </React.Fragment>
      ))}

      {/* End card */}
      <motion.div
        variants={revealBlur}
        className="mt-24 flex flex-col items-center gap-3 text-center"
      >
        <Flourish className="h-3 w-48 text-amber/40" />
        <p className="font-serif text-base italic text-ivory">Fin.</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-amber/40">
          {narrative.scenes.length} Scenes · {narrative.wordCount.toLocaleString()} Words · Lemniscate
        </p>
      </motion.div>
    </motion.article>
  )
}

// ─── Right sidebar (Cinematified, non-immersive) ─────────────────────────────

interface SidebarProps {
  scenes: ReaderScene[]
  locations: ReaderLocation[]
  currentSceneIdx: number
  onJumpScene: (i: number) => void
  bookmarks: ReaderBookmark[]
  onJumpBookmark: (bm: ReaderBookmark) => void
  onDeleteBookmark: (id: string) => void
}

function ReaderSidebar({
  scenes,
  locations,
  currentSceneIdx,
  onJumpScene,
  bookmarks,
  onJumpBookmark,
  onDeleteBookmark,
}: SidebarProps) {
  const current = scenes[currentSceneIdx]

  return (
    <motion.aside
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={spring.gentle}
      className="sticky top-20 hidden h-[calc(100vh-6rem)] w-72 shrink-0 overflow-y-auto rounded-xl border border-amber/15 bg-plum/20 p-4 backdrop-blur-xl scrollbar-lemniscate lg:block"
      aria-label="Reader explorer"
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
                <span className="truncate">{s.title}</span>
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

function BottomNav({
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

// ─── Main ReaderView ─────────────────────────────────────────────────────────

export function ReaderView() {
  const narrativeId = useLemniscate((s) => s.activeNarrativeId)
  const activeMode = useLemniscate((s) => s.activeMode)
  const fontSize = useLemniscate((s) => s.readerFontSize)
  const readerTheme = useLemniscate((s) => s.readerTheme)
  const immersive = useLemniscate((s) => s.readerImmersive)
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
  useMotionValueEvent(smoothProgress, 'change', (v) => setProgress(v))

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

  // ─── Theme sync: readerTheme follows the global theme, toggle updates both ─
  React.useEffect(() => {
    if (globalTheme === 'light' || globalTheme === 'dark') {
      if (globalTheme !== readerTheme) setReaderTheme(globalTheme)
    }
  }, [globalTheme, readerTheme, setReaderTheme])

  // ─── Reading progress: fetch on mount ──────────────────────────────────────
  React.useEffect(() => {
    if (!narrativeId) return
    let cancelled = false
    fetch(`/api/narratives/${narrativeId}/progress`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data.progress) {
          setSavedProgress(data.progress as ReaderProgress)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [narrativeId])

  // ─── Restore scroll position once narrative renders ────────────────────────
  React.useEffect(() => {
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
  const saveProgress = React.useCallback(
    (force = false) => {
      if (!narrativeId || restoringRef.current) return
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

      const isCine =
        activeModeRef.current === 'CINEMATIFIED' &&
        narrativeModeRef.current === 'CINEMATIFIED'
      const sceneIndex = isCine ? currentSceneIdxRef.current : 0

      lastSaveRef.current = now
      fetch(`/api/narratives/${narrativeId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scrollPct, sceneIndex, paragraphIdx }),
      }).catch(() => {})
    },
    [narrativeId],
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

  // ─── Bookmarks: fetch on mount + when narrativeId changes ──────────────────
  const refreshBookmarks = React.useCallback(() => {
    if (!narrativeId) return
    fetch(`/api/narratives/${narrativeId}/bookmarks`)
      .then((r) => r.json())
      .then((data) =>
        setBookmarks((data.bookmarks as ReaderBookmark[]) || []),
      )
      .catch(() => {})
  }, [narrativeId])

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
      // Arrow keys: navigate scenes (cinematified only) — disabled while search is open
      if (
        activeMode === 'CINEMATIFIED' &&
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
  // Derived effective mode (also computed post-load in the render section)
  const isCinematifiedMode =
    activeMode === 'CINEMATIFIED' && narrative?.mode === 'CINEMATIFIED'

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
    const currentPct = progress * 100
    return bookmarks.some(
      (bm) => Math.abs((bm.offset || 0) - currentPct) < 3,
    )
  }, [bookmarks, isCinematifiedMode, currentSceneIdx, progress])

  // Toggle bookmark at current position
  const onToggleBookmark = React.useCallback(() => {
    if (!narrativeId) return
    // If current pos is already bookmarked, remove it
    if (isCurrentBookmarked) {
      const existing = isCinematifiedMode
        ? bookmarks.find((bm) => bm.sceneIndex === currentSceneIdx)
        : bookmarks.find(
            (bm) => Math.abs((bm.offset || 0) - progress * 100) < 3,
          )
      if (existing) {
        fetch(
          `/api/narratives/${narrativeId}/bookmarks?bookmarkId=${existing.id}`,
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
    const scrollPct = Math.min(100, Math.max(0, Math.round(progress * 100)))
    const sceneIndex = isCinematifiedMode ? currentSceneIdx : null
    const label = isCinematifiedMode && narrative
      ? `Scene ${currentSceneIdx + 1}${
          narrative.scenes[currentSceneIdx]?.title
            ? ` · ${narrative.scenes[currentSceneIdx].title}`
            : ''
        }`
      : `${scrollPct}% through`
    fetch(`/api/narratives/${narrativeId}/bookmarks`, {
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
    narrativeId,
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
      if (!narrativeId) return
      fetch(
        `/api/narratives/${narrativeId}/bookmarks?bookmarkId=${id}`,
        { method: 'DELETE' },
      )
        .then(() => {
          refreshBookmarks()
          toast({ title: 'Bookmark deleted' })
        })
        .catch(() => {})
    },
    [narrativeId, refreshBookmarks, toast],
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

  // Continue-reading hint actions
  const onDismissHint = React.useCallback(() => {
    setShowContinueHint(false)
  }, [])

  const onStartOver = React.useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setShowContinueHint(false)
    if (narrativeId) {
      fetch(`/api/narratives/${narrativeId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scrollPct: 0, sceneIndex: 0, paragraphIdx: 0 }),
      }).catch(() => {})
    }
  }, [narrativeId])

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
  const isCinematified = activeMode === 'CINEMATIFIED' && narrative.mode === 'CINEMATIFIED'
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
            currentSceneIdx={currentSceneIdx}
            onJumpScene={jumpScene}
            bookmarks={bookmarks}
            onJumpBookmark={onJumpBookmark}
            onDeleteBookmark={onDeleteBookmark}
          />
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
