'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLemniscate } from '../store'
import { useRealtime } from '../use-realtime'
import { InfinityMark, Flourish } from '../logo'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  staggerContainer,
  revealScale,
  revealUp,
  revealFade,
} from '@/lib/motion'
import type { LucideIcon } from 'lucide-react'
import {
  Upload,
  Sparkles,
  CheckCircle2,
  Loader2,
  Search,
  Type,
  Film,
  BookOpen,
  ArrowUpDown,
  Library as LibraryIcon,
  X,
} from 'lucide-react'
import type {
  LibraryDocument,
  StatsResponse,
  FilterKey,
  SortKey,
} from './library-types'
import {
  ACCEPTED,
  POLL_INTERVAL,
  coverFromHash,
  stripExt,
  isProcessingJob,
  isCompletedDoc,
  uploadDocument,
} from './library-shared'
import { StatsStrip, EmptyState, SkeletonGrid } from './library-states'
import { UploadZone } from './library-upload-zone'
import { BookCard } from './library-book-card'

// ─── Constants ──────────────────────────────────────────────────────────────

const FILTERS: { key: FilterKey; label: string; icon: LucideIcon }[] = [
  { key: 'all', label: 'All', icon: LibraryIcon },
  { key: 'processing', label: 'Processing', icon: Loader2 },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
  { key: 'original', label: 'Original', icon: Type },
  { key: 'cinematified', label: 'Cinematified', icon: Film },
]

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'name', label: 'Name' },
  { key: 'size', label: 'Size' },
]

// ─── Main view ──────────────────────────────────────────────────────────────

export function LibraryView() {
  const { toast } = useToast()
  const openProcessing = useLemniscate((s) => s.openProcessing)
  const openReader = useLemniscate((s) => s.openReader)
  const openLanding = useLemniscate((s) => s.openLanding)
  const uploadMode = useLemniscate((s) => s.uploadMode)

  const [docs, setDocs] = React.useState<LibraryDocument[] | null>(null)
  const [stats, setStats] = React.useState<StatsResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [uploading, setUploading] = React.useState(false)
  const [continueReading, setContinueReading] = React.useState<Array<{ narrativeId: string; docId: string; title: string; originalName: string; scrollPct: number; sceneIndex: number; mode: string; fileHash: string }>>([])

  const [filter, setFilter] = React.useState<FilterKey>('all')
  const [search, setSearch] = React.useState('')
  const [sort, setSort] = React.useState<SortKey>('recent')

  const headerInputRef = React.useRef<HTMLInputElement>(null)

  // ─── Data fetching (initial load + 5s poll, no loading on poll) ──────────
  const refresh = React.useCallback(
    async (initial = false) => {
      if (initial) setLoading(true)
      try {
        const [docsRes, statsRes] = await Promise.all([
          fetch('/api/documents'),
          fetch('/api/stats'),
        ])
        if (docsRes.ok) {
          const data = await docsRes.json()
          setDocs(Array.isArray(data.documents) ? data.documents : [])
        }
        if (statsRes.ok) {
          setStats(await statsRes.json())
        }
      } catch {
        if (initial) {
          toast({ title: 'Failed to load library', variant: 'destructive' })
        }
        // silent on poll failures — keep showing existing data
      } finally {
        if (initial) setLoading(false)
      }
    },
    [toast],
  )

  React.useEffect(() => {
    const initialTimer = setTimeout(() => refresh(true), 0)
    const t = setInterval(() => refresh(false), POLL_INTERVAL)
    return () => { clearTimeout(initialTimer); clearInterval(t) }
  }, [refresh])

  // ─── Fetch reading progress for all narratives in a single bulk query ─────
  // Previously this did O(docs × narratives) sequential fetches (N+1 problem).
  // The /api/reading-progress endpoint returns all in-progress narratives in
  // one DB query with a single joined include, replacing dozens of round-trips.
  React.useEffect(() => {
    if (!docs) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/reading-progress')
        if (!res.ok) return
        const data = (await res.json()) as {
          items?: Array<{
            narrativeId: string
            docId: string
            title: string
            originalName: string
            fileHash: string
            scrollPct: number
            sceneIndex?: number
            mode: string
          }>
        }
        if (cancelled) return
        const items: typeof continueReading = (data.items ?? []).map((item) => ({
          narrativeId: item.narrativeId,
          docId: item.docId,
          title: item.title,
          originalName: item.originalName,
          scrollPct: item.scrollPct,
          sceneIndex: item.sceneIndex ?? 0,
          mode: item.mode,
          fileHash: item.fileHash,
        }))
        // Sort by progress descending, take top 4 (matching server-side logic)
        items.sort((a, b) => b.scrollPct - a.scrollPct)
        if (!cancelled) setContinueReading(items.slice(0, 4))
      } catch {
        // silent — keep showing existing data
      }
    })()
    return () => { cancelled = true }
  }, [docs])

  // ─── Realtime subscription for active jobs ───────────────────────────────
  const activeJobIds = React.useMemo(() => {
    if (!docs) return []
    return docs
      .flatMap((d) => d.jobs)
      .filter((j) => j.status === 'QUEUED' || j.status === 'PROCESSING')
      .map((j) => j.id)
  }, [docs])
  useRealtime(activeJobIds)

  // ─── Upload handler (header button → file picker) ────────────────────────
  // Delegates the fetch to the shared `uploadDocument` helper (same logic as
  // the drop zone); keeps the caller responsible for UI feedback (toast,
  // navigation, uploading flag).
  const handleHeaderUpload = React.useCallback(
    async (file: File) => {
      setUploading(true)
      try {
        const { jobId, documentId } = await uploadDocument(file, uploadMode)
        toast({
          title: 'Document queued',
          description: `${file.name} → ${uploadMode}. Processing has begun.`,
        })
        openProcessing(jobId, documentId)
      } catch (err) {
        toast({
          title: 'Upload failed',
          description: (err as Error).message,
          variant: 'destructive',
        })
      } finally {
        setUploading(false)
      }
    },
    [uploadMode, openProcessing, toast],
  )

  // ─── Sample handler ──────────────────────────────────────────────────────
  const handleSample = React.useCallback(async () => {
    setUploading(true)
    try {
      const res = await fetch(`/api/sample?mode=${uploadMode}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sample creation failed')
      toast({
        title: 'Sample narrative queued',
        description: `"${data.sampleTitle}" → ${uploadMode} mode.`,
      })
      openProcessing(data.jobId, data.documentId)
    } catch (err) {
      toast({
        title: 'Sample failed',
        description: (err as Error).message,
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
    }
  }, [uploadMode, openProcessing, toast])

  // ─── Open document (click on card) ───────────────────────────────────────
  const handleOpen = React.useCallback(
    async (doc: LibraryDocument) => {
      const latestJob = doc.jobs[0]
      if (isProcessingJob(latestJob)) {
        openProcessing(latestJob.id, doc.id)
        return
      }
      if (latestJob?.status === 'FAILED' || doc.status === 'FAILED') {
        toast({
          title: 'Processing failed',
          description: 'This document could not be transformed. Try re-uploading.',
          variant: 'destructive',
        })
        return
      }
      if (!isCompletedDoc(doc)) {
        toast({
          title: 'Not ready yet',
          description: 'This document has no narratives available.',
        })
        return
      }
      try {
        const res = await fetch(`/api/documents/${doc.id}/narratives`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const narrs: { id: string; mode: string }[] = data.narratives ?? []
        const cinema = narrs.find((n) => n.mode === 'CINEMATIFIED')
        const orig = narrs.find((n) => n.mode === 'ORIGINAL')
        const target = cinema || orig
        if (target) {
          openReader(
            target.id,
            target.mode as 'ORIGINAL' | 'CINEMATIFIED',
            doc.id,
          )
        } else {
          toast({
            title: 'No narratives found',
            description: 'This document has no readable narratives yet.',
            variant: 'destructive',
          })
        }
      } catch {
        toast({
          title: 'Could not load narratives',
          variant: 'destructive',
        })
      }
    },
    [openProcessing, openReader, toast],
  )

  // ─── Delete handler ──────────────────────────────────────────────────────
  const handleDelete = React.useCallback(
    async (doc: LibraryDocument) => {
      const title = stripExt(doc.originalName)
      if (
        !confirm(`Delete "${title}" and all its narratives? This cannot be undone.`)
      )
        return
      try {
        const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        toast({
          title: 'Document deleted',
          description: title,
        })
        refresh(false)
      } catch {
        toast({ title: 'Delete failed', variant: 'destructive' })
      }
    },
    [refresh, toast],
  )

  // ─── Derived: filtered + sorted docs ─────────────────────────────────────
  const filtered = React.useMemo(() => {
    if (!docs) return []
    const q = search.trim().toLowerCase()
    let out = docs.filter((d) => {
      // search — match filename, detected title, author, and series
      if (q) {
        const haystack = [d.originalName, d.title, d.author, d.series]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      // filter
      const latestJob = d.jobs[0]
      const latestMode = latestJob?.mode
      switch (filter) {
        case 'processing':
          return isProcessingJob(latestJob)
        case 'completed':
          return isCompletedDoc(d)
        case 'original':
          return latestMode === 'ORIGINAL' || latestMode === 'BOTH'
        case 'cinematified':
          return latestMode === 'CINEMATIFIED' || latestMode === 'BOTH'
        default:
          return true
      }
    })
    // sort
    out = [...out].sort((a, b) => {
      switch (sort) {
        case 'name': {
          const an = (a.title && a.title.trim()) || stripExt(a.originalName)
          const bn = (b.title && b.title.trim()) || stripExt(b.originalName)
          return an.localeCompare(bn)
        }
        case 'size':
          return b.sizeBytes - a.sizeBytes
        default:
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
      }
    })
    return out
  }, [docs, search, filter, sort])

  const isEmpty = !loading && docs !== null && docs.length === 0
  const noResults = !loading && docs !== null && docs.length > 0 && filtered.length === 0

  return (
    <div className="relative mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
      {/* Ambient backdrop glow */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse 70% 40% at 50% 0%, oklch(0.82 0.12 75 / 0.06), transparent 60%)',
        }}
      />

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="space-y-8"
      >
        {/* ─── Header ─── */}
        <motion.header
          variants={revealUp}
          className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-amber/70">
              <InfinityMark className="h-3.5 w-3.5" animated={false} />
              <span>Lemniscate Library</span>
            </div>
            <h1 className="text-headline text-ivory">Your Library</h1>
            <p className="text-pretty text-sm text-muted-foreground">
              Narratives reconstructed from your documents
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <input
              ref={headerInputRef}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleHeaderUpload(f)
                e.target.value = ''
              }}
            />
            <Button
              onClick={() => headerInputRef.current?.click()}
              disabled={uploading}
              size="lg"
              className="gap-2 bg-linear-to-br from-amber to-amber/80 text-midnight shadow-glow-amber hover:from-amber/90 hover:to-amber/70"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Upload
            </Button>
            <Button
              onClick={handleSample}
              disabled={uploading}
              variant="outline"
              size="lg"
              className="gap-2 border-amber/30 bg-transparent text-amber hover:border-amber/50 hover:bg-amber/5"
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Sample</span>
              <span className="sm:hidden">Sample</span>
            </Button>
          </div>
        </motion.header>

        {/* ─── Upload zone (collapsible) ─── */}
        <motion.div variants={revealUp}>
          <UploadZone onUploaded={openProcessing} />
        </motion.div>

        {/* ─── Stats strip ─── */}
        <motion.div variants={revealUp}>
          <StatsStrip stats={stats} />
        </motion.div>

        {/* ─── Empty state ─── */}
        {isEmpty ? (
          <motion.div variants={revealFade}>
            <Card className="surface-raised overflow-hidden border-amber/15">
              <EmptyState
                onUpload={() => headerInputRef.current?.click()}
                onSample={handleSample}
                uploading={uploading}
              />
            </Card>
          </motion.div>
        ) : (
          <>
            {/* ─── Filter bar ─── */}
            <motion.div
              variants={revealUp}
              className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
            >
              {/* Filter pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                {FILTERS.map((f) => {
                  const Icon = f.icon
                  const active = filter === f.key
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFilter(f.key)}
                      aria-pressed={active}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                        active
                          ? 'border-amber/40 bg-amber/15 text-amber shadow-glow-amber'
                          : 'border-amber/12 bg-midnight/30 text-muted-foreground hover:border-amber/25 hover:text-ivory'
                      }`}
                    >
                      <Icon
                        className={`h-3.5 w-3.5 ${active && f.key === 'processing' ? 'animate-spin' : ''}`}
                      />
                      {f.label}
                    </button>
                  )
                })}
              </div>

              {/* Search + sort */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 lg:w-56">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search filenames…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-9 border-amber/15 bg-midnight/40 pl-8 text-sm text-ivory placeholder:text-muted-foreground focus-visible:border-amber/40"
                    aria-label="Search documents by filename"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-ivory"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Sort */}
                <div className="flex items-center gap-1 rounded-md border border-amber/15 bg-midnight/40 p-0.5">
                  <ArrowUpDown className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" />
                  {SORTS.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setSort(s.key)}
                      aria-pressed={sort === s.key}
                      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                        sort === s.key
                          ? 'bg-amber/15 text-amber'
                          : 'text-muted-foreground hover:text-ivory'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* ─── Continue Reading ─── */}
            {!loading && continueReading.length > 0 && filter === 'all' && !search && (
              <motion.section variants={revealUp} className="space-y-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-amber/60" />
                  <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-amber/70">Continue Reading</h2>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {continueReading.map((item) => {
                    const cover = coverFromHash(item.fileHash)
                    return (
                      <motion.button
                        key={item.narrativeId}
                        variants={revealScale}
                        whileHover={{ y: -4 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => openReader(item.narrativeId, item.mode as 'ORIGINAL' | 'CINEMATIFIED', item.docId)}
                        className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-amber/12 p-3 text-left transition-colors hover:border-amber/30 hover:bg-amber/5"
                      >
                        <div
                          className="flex h-12 w-9 shrink-0 items-center justify-center rounded-md text-ivory/80"
                          style={{ background: cover.background }}
                        >
                          <InfinityMark className="h-4 w-4 opacity-40" animated={false} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-serif text-sm font-medium text-ivory">{item.title}</p>
                          <p className="truncate text-[11px] text-slate">{item.mode === 'CINEMATIFIED' ? `Scene ${item.sceneIndex + 1}` : 'Original'}</p>
                          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-midnight/40">
                            <div className="h-full rounded-full bg-linear-to-r from-amber to-burgundy" style={{ width: `${item.scrollPct}%` }} />
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-[10px] tabular-nums text-amber/60">{item.scrollPct}%</span>
                      </motion.button>
                    )
                  })}
                </div>
              </motion.section>
            )}

            {/* ─── Document grid ─── */}
            {loading ? (
              <SkeletonGrid />
            ) : noResults ? (
              <motion.div
                variants={revealFade}
                className="flex flex-col items-center justify-center px-6 py-16 text-center"
              >
                <Search className="mb-4 h-10 w-10 text-amber/30" />
                <h3 className="text-title text-ivory">No documents match</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Try a different filter or clear your search.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 gap-1.5 border-amber/25 text-amber hover:border-amber/40 hover:bg-amber/5"
                  onClick={() => {
                    setFilter('all')
                    setSearch('')
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                  Reset filters
                </Button>
              </motion.div>
            ) : (
              <motion.div
                layout
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              >
                <AnimatePresence mode="popLayout">
                  {filtered.map((doc) => (
                    <BookCard
                      key={doc.id}
                      doc={doc}
                      onOpen={handleOpen}
                      onDelete={handleDelete}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </>
        )}

        {/* ─── Footer flourish ─── */}
        {!isEmpty && (
          <motion.div
            variants={revealFade}
            className="flex flex-col items-center gap-2 pt-8 text-center"
          >
            <Flourish className="h-3 w-32 text-amber/25" />
            <button
              type="button"
              onClick={openLanding}
              className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-amber"
            >
              ← Back to landing
            </button>
          </motion.div>
        )}
      </motion.div>

      {/* Hidden input for empty-state upload CTA (shares header input) */}
    </div>
  )
}
