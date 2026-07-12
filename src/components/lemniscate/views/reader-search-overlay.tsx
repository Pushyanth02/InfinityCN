'use client'

/**
 * Lemniscate — Reader Search Overlay
 * ----------------------------------------------------------------------------
 * Linear-style command-palette search over a narrative's paragraphs, scenes,
 * and characters. Extracted from `reader.tsx` (Phase 4 decomposition) — the
 * behavior is unchanged; it fetches `/api/narratives/[id]/search` and renders
 * grouped, jump-to results.
 */
import * as React from 'react'
import { useRef } from 'react'
import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { spring } from '@/lib/motion'
import { Search, Loader2, FileText, Film, Users, ChevronRight } from 'lucide-react'
import { useDebouncedValue, useFocusTrap } from '../hooks'

interface ReaderSearchResult {
  type: 'paragraph' | 'scene' | 'character'
  refId: string
  title: string
  snippet: string
  matchCount: number
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

interface SearchOverlayProps {
  narrativeId: string
  onClose: () => void
  onJumpParagraph: (id: string) => void
  onJumpScene: (id: string) => void
}

export function SearchOverlay({
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
  // Trap focus inside the dialog while open; returns to the trigger (the
  // search button) on close.
  const dialogRef = useFocusTrap<HTMLDivElement>(true, inputRef)

  // Auto-focus on mount — focus also moves into the trap, but we set this
  // explicitly so the input is the initial target even if the trap's
  // initialFocusRef resolution races the mount.
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
      className="fixed inset-0 z-80 flex items-start justify-center bg-midnight/80 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Search narrative"
    >
      <motion.div
        ref={dialogRef}
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
