'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLemniscate } from '../store'
import { useRealtime } from '../use-realtime'
import { InfinityFlow, InfinityMark, Flourish } from '../logo'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  staggerContainer,
  revealScale,
  revealUp,
  revealFade,
  spring,
} from '@/lib/motion'
import type { LucideIcon } from 'lucide-react'
import {
  FileText,
  Upload,
  Sparkles,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  Search,
  ChevronDown,
  Type,
  Film,
  Layers,
  BookOpen,
  Users,
  Clapperboard,
  FileUp,
  HardDrive,
  ArrowUpDown,
  Library as LibraryIcon,
  X,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

interface DocJob {
  id: string
  mode: string
  status: string
  progress: number
  stage: string | null
}

interface LibraryDocument {
  id: string
  originalName: string
  mimeType: string
  sizeBytes: number
  status: string
  createdAt: string
  fileHash: string
  // Deterministically detected metadata (Milestone 2). Null until processed.
  title: string | null
  author: string | null
  subtitle: string | null
  series: string | null
  language: string | null
  wordCount: number | null
  readingTimeMin: number | null
  chapterCount: number
  _count: { jobs: number; narratives: number }
  jobs: DocJob[]
}

interface StatsResponse {
  counts: {
    documents: number
    jobs: number
    narratives: number
    scenes: number
    characters: number
    events: number
    peaks: number
  }
  byStatus: { status: string; _count: number }[]
  byJobStatus: { status: string; _count: number }[]
  byMode: { mode: string; _count: number }[]
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ACCEPTED = '.pdf,.docx,.doc,.txt,.md'
const POLL_INTERVAL = 5000

const STAGE_LABEL: Record<string, string> = {
  QUEUED: 'Queued',
  EXTRACT: 'Extracting text',
  SEGMENT: 'Segmenting',
  ORIGINAL: 'Reconstructing',
  CINEMATIFY: 'Cinematifying',
  ANALYZE: 'Analyzing',
  FINALIZE: 'Finalizing',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
}

const FILE_TYPE_META: Record<
  string,
  { label: string; tint: string }
> = {
  pdf: { label: 'PDF', tint: 'oklch(0.55 0.2 22)' },
  docx: { label: 'DOC', tint: 'oklch(0.6 0.15 290)' },
  doc: { label: 'DOC', tint: 'oklch(0.6 0.15 290)' },
  txt: { label: 'TXT', tint: 'oklch(0.6 0.14 165)' },
  md: { label: 'MD', tint: 'oklch(0.72 0.15 55)' },
}

type FilterKey = 'all' | 'processing' | 'completed' | 'original' | 'cinematified'
type SortKey = 'recent' | 'name' | 'size'

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

// ─── Cover gradient generator (deterministic from file hash) ─────────────────

interface CoverDesign {
  background: string
  accent1: string
  accent2: string
  angle: number
  glowX: number
  glowY: number
  motifRotation: number
}

const COVER_PALETTES: { from: string; to: string; glow: string }[] = [
  // Amber sunrise over burgundy
  { from: 'oklch(0.32 0.1 25)', to: 'oklch(0.72 0.14 70)', glow: 'oklch(0.88 0.12 80 / 0.5)' },
  // Plum night with gold
  { from: 'oklch(0.18 0.05 290)', to: 'oklch(0.55 0.1 55)', glow: 'oklch(0.82 0.12 75 / 0.45)' },
  // Teal deep with amber
  { from: 'oklch(0.22 0.06 175)', to: 'oklch(0.75 0.13 75)', glow: 'oklch(0.7 0.14 165 / 0.4)' },
  // Midnight slate with gold filigree
  { from: 'oklch(0.16 0.02 270)', to: 'oklch(0.6 0.1 65)', glow: 'oklch(0.82 0.12 75 / 0.4)' },
  // Climax rose over plum
  { from: 'oklch(0.2 0.05 290)', to: 'oklch(0.6 0.18 350)', glow: 'oklch(0.65 0.18 350 / 0.4)' },
  // Burgundy wine with gold
  { from: 'oklch(0.25 0.09 25)', to: 'oklch(0.7 0.13 65)', glow: 'oklch(0.82 0.12 75 / 0.45)' },
  // Deep teal with plum
  { from: 'oklch(0.2 0.05 175)', to: 'oklch(0.4 0.08 290)', glow: 'oklch(0.6 0.12 290 / 0.4)' },
  // Warm amber monochrome
  { from: 'oklch(0.3 0.07 60)', to: 'oklch(0.78 0.14 70)', glow: 'oklch(0.88 0.1 80 / 0.5)' },
  // Charcoal with tension red
  { from: 'oklch(0.15 0.01 270)', to: 'oklch(0.5 0.18 22)', glow: 'oklch(0.6 0.2 22 / 0.4)' },
  // Plum to calm teal
  { from: 'oklch(0.2 0.06 290)', to: 'oklch(0.5 0.12 165)', glow: 'oklch(0.6 0.14 165 / 0.4)' },
]

function coverFromHash(hash: string): CoverDesign {
  const safe = hash && hash.length >= 16 ? hash : '0000000000000000'
  const seg = (offset: number, len: number) =>
    parseInt(safe.slice(offset, offset + len), 16) || 0

  const h1 = seg(0, 8)
  const h2 = seg(8, 8)
  const h3 = seg(16, 8) || h1

  const palette = COVER_PALETTES[h1 % COVER_PALETTES.length]
  const angle = 90 + (h2 % 180) // 90–270deg keeps the gradient diagonal-ish
  const glowX = 12 + (h3 % 76)
  const glowY = 10 + ((h3 >> 8) % 70)
  const motifRotation = (h2 % 8) * 5 - 20

  return {
    background: `linear-gradient(${angle}deg, ${palette.from} 0%, ${palette.to} 100%)`,
    accent1: palette.from,
    accent2: palette.to,
    angle,
    glowX,
    glowY,
    motifRotation,
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getFileType(name: string): { ext: string; label: string; tint: string } {
  const ext = name.split('.').pop()?.toLowerCase() || 'file'
  const meta = FILE_TYPE_META[ext] || {
    label: ext.toUpperCase().slice(0, 3),
    tint: 'oklch(0.72 0.15 55)',
  }
  return { ext, ...meta }
}

function stripExt(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx > 0 ? name.slice(0, idx) : name
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  const day = 24 * 60 * 60 * 1000
  if (diff < 60_000) return 'just now'
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < day) return `${Math.floor(diff / (60 * 60_000))}h ago`
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function estimateWords(sizeBytes: number, mimeType: string): string {
  // Rough estimate: text ~6 bytes/word; PDF/DOCX compressed payload is larger
  // than extracted text, so use a conservative divisor.
  const divisor = mimeType.includes('pdf') || mimeType.includes('officedocument') ? 18 : 6
  const words = Math.max(1, Math.round(sizeBytes / divisor))
  if (words >= 1000) return `${(words / 1000).toFixed(1)}k words`
  return `${words} words`
}

function isProcessingJob(j?: DocJob): boolean {
  return !!j && (j.status === 'QUEUED' || j.status === 'PROCESSING')
}

function isCompletedDoc(doc: LibraryDocument): boolean {
  return (doc.status === 'PROCESSED' || doc.status === 'COMPLETED') && doc._count.narratives > 0
}

// ─── Stats strip ────────────────────────────────────────────────────────────

function StatsStrip({ stats }: { stats: StatsResponse | null }) {
  const items = [
    { icon: FileText, label: 'Documents', value: stats?.counts.documents ?? 0 },
    { icon: BookOpen, label: 'Narratives', value: stats?.counts.narratives ?? 0 },
    { icon: Clapperboard, label: 'Scenes', value: stats?.counts.scenes ?? 0 },
    { icon: Users, label: 'Characters', value: stats?.counts.characters ?? 0 },
  ]
  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      {items.map((it) => {
        const Icon = it.icon
        return (
          <motion.div key={it.label} variants={revealScale}>
            <Card className="surface-raised group relative overflow-hidden rounded-xl border-amber/10 p-4 transition-colors hover:border-amber/25">
              <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-amber/5 blur-2xl transition-opacity group-hover:opacity-100" aria-hidden />
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber/20 bg-amber/10 text-amber">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 leading-tight">
                  <div className="font-serif text-2xl font-medium tabular-nums text-ivory">
                    {it.value}
                  </div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                    {it.label}
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        )
      })}
    </motion.div>
  )
}

// ─── Upload zone (collapsible) ───────────────────────────────────────────────

function UploadZone({
  onUploaded,
}: {
  onUploaded: (jobId: string, documentId: string) => void
}) {
  const { toast } = useToast()
  const uploadMode = useLemniscate((s) => s.uploadMode)
  const setUploadMode = useLemniscate((s) => s.setUploadMode)
  const [open, setOpen] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleFile = React.useCallback(
    async (file: File) => {
      setUploading(true)
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('mode', uploadMode)
        const res = await fetch('/api/documents/upload', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Upload failed')
        toast({
          title: 'Document queued',
          description: `${file.name} → ${uploadMode}. Processing has begun.`,
        })
        onUploaded(data.jobId, data.documentId)
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
    [uploadMode, onUploaded, toast],
  )

  return (
    <div className="surface-raised overflow-hidden rounded-xl border-amber/12">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-amber/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/40"
        aria-expanded={open}
        aria-controls="upload-zone-panel"
      >
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber/20 bg-amber/10 text-amber">
            <FileUp className="h-4 w-4" />
          </span>
          <span>
            <span className="block font-serif text-sm font-medium text-ivory">
              Upload a document
            </span>
            <span className="block text-[11px] text-muted-foreground">
              Drag &amp; drop · PDF / DOCX / TXT · mode: <span className="text-amber/80">{uploadMode}</span>
            </span>
          </span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring.snappy}>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="upload-zone-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-amber/10 p-4">
              {/* Mode selector */}
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Layers className="h-3.5 w-3.5 text-amber/70" />
                  <span className="uppercase tracking-[0.15em]">Transformation mode</span>
                </div>
                <Tabs
                  value={uploadMode}
                  onValueChange={(v) => setUploadMode(v as typeof uploadMode)}
                >
                  <TabsList className="bg-midnight/60">
                    <TabsTrigger
                      value="ORIGINAL"
                      className="gap-1.5 text-xs data-[state=active]:bg-amber/15 data-[state=active]:text-amber"
                    >
                      <Type className="h-3.5 w-3.5" />
                      Original
                    </TabsTrigger>
                    <TabsTrigger
                      value="CINEMATIFIED"
                      className="gap-1.5 text-xs data-[state=active]:bg-amber/15 data-[state=active]:text-amber"
                    >
                      <Film className="h-3.5 w-3.5" />
                      Cinematified
                    </TabsTrigger>
                    <TabsTrigger
                      value="BOTH"
                      className="gap-1.5 text-xs data-[state=active]:bg-amber/15 data-[state=active]:text-amber"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      Both
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Drop zone */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Drop a file here or press Enter to browse for a document"
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  const f = e.dataTransfer.files?.[0]
                  if (f) handleFile(f)
                }}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    inputRef.current?.click()
                  }
                }}
                className={`group relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/50 ${
                  dragging
                    ? 'border-amber bg-amber/10 shadow-glow-amber'
                    : 'border-amber/25 hover:border-amber/50 hover:bg-amber/5'
                }`}
              >
                {uploading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-amber" />
                ) : (
                  <Upload className="h-8 w-8 text-muted-foreground transition-colors group-hover:text-amber" />
                )}
                <div className="space-y-1">
                  <p className="font-serif text-sm font-medium text-ivory">
                    {uploading ? 'Uploading…' : 'Drop a file or click to browse'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    PDF · DOCX · TXT · MD · max 25 MB
                  </p>
                </div>

                {/* File type icons */}
                <div className="mt-2 flex items-center gap-2" aria-hidden>
                  {['PDF', 'DOCX', 'TXT'].map((label, i) => (
                    <span
                      key={label}
                      className="rounded-md border border-amber/15 bg-midnight/40 px-2 py-1 font-mono text-[10px] font-semibold tracking-wider text-muted-foreground"
                      style={{ opacity: 0.5 + i * 0.15 }}
                    >
                      {label}
                    </span>
                  ))}
                </div>

                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPTED}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFile(f)
                    e.target.value = ''
                  }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Book card ──────────────────────────────────────────────────────────────

function BookCard({
  doc,
  onOpen,
  onDelete,
}: {
  doc: LibraryDocument
  onOpen: (doc: LibraryDocument) => void
  onDelete: (doc: LibraryDocument) => void
}) {
  const latestJob = doc.jobs[0]
  const processing = isProcessingJob(latestJob)
  const completed = isCompletedDoc(doc)
  const failed = latestJob?.status === 'FAILED' || doc.status === 'FAILED'

  // Live progress from realtime store (falls back to job snapshot)
  const liveProgress = useLemniscate((s) =>
    latestJob ? s.progress[latestJob.id]?.progress ?? latestJob.progress ?? 0 : 0,
  )
  const liveStage = useLemniscate((s) =>
    latestJob ? s.progress[latestJob.id]?.stage ?? latestJob.stage ?? 'QUEUED' : 'QUEUED',
  )

  const cover = React.useMemo(() => coverFromHash(doc.fileHash), [doc.fileHash])
  const { label: typeLabel, tint: typeTint } = getFileType(doc.originalName)
  // Prefer the deterministically detected title; fall back to the filename.
  const title = (doc.title && doc.title.trim()) || stripExt(doc.originalName)
  const stageLabel = STAGE_LABEL[liveStage] ?? liveStage

  const statusBadge = processing ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber/40 bg-midnight/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber backdrop-blur-sm">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber" />
      </span>
      Processing
    </span>
  ) : failed ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-burgundy/50 bg-midnight/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-burgundy backdrop-blur-sm">
      <AlertCircle className="h-3 w-3" />
      Failed
    </span>
  ) : completed ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-midnight/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400 backdrop-blur-sm">
      <CheckCircle2 className="h-3 w-3" />
      Completed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate/40 bg-midnight/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate backdrop-blur-sm">
      <Clock className="h-3 w-3" />
      {doc.status}
    </span>
  )

  return (
    <motion.div
      layout
      variants={revealScale}
      initial="initial"
      animate="animate"
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      whileHover={{ y: -6, transition: spring.snappy }}
      className="group relative"
    >
      <Card
        className="surface-raised relative cursor-pointer overflow-hidden rounded-xl border-amber/10 p-0 transition-shadow duration-300 hover:border-amber/30 hover:shadow-cinema"
        onClick={() => onOpen(doc)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen(doc)
          }
        }}
        tabIndex={0}
        role="button"
        aria-label={`Open ${title}`}
      >
        {/* ─── Cover ─── */}
        <div
          className="relative h-44 w-full overflow-hidden"
          style={{ background: cover.background }}
        >
          {/* Layered radial accent for depth */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(circle at ${cover.glowX}% ${cover.glowY}%, oklch(1 0 0 / 0.18), transparent 55%)`,
            }}
            aria-hidden
          />
          {/* Subtle vignette */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 120%, oklch(0 0 0 / 0.45), transparent 60%)',
            }}
            aria-hidden
          />

          {/* File type badge — top left */}
          <span
            className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md border border-ivory/20 bg-midnight/60 px-2 py-1 font-mono text-[10px] font-bold tracking-wider text-ivory backdrop-blur-sm"
            style={{ boxShadow: `inset 0 0 0 1px ${typeTint}33` }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: typeTint }}
            />
            {typeLabel}
          </span>

          {/* Delete button — top right, appears on hover */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(doc)
            }}
            aria-label={`Delete ${title}`}
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md border border-ivory/15 bg-midnight/60 text-ivory/70 opacity-0 backdrop-blur-sm transition-all hover:border-burgundy/60 hover:bg-burgundy/20 hover:text-burgundy focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          {/* Infinity watermark — bottom right */}
          <div
            className="pointer-events-none absolute bottom-3 right-3 text-ivory/25"
            style={{ transform: `rotate(${cover.motifRotation}deg)` }}
            aria-hidden
          >
            <InfinityMark className="h-9 w-9" animated={false} />
          </div>

          {/* Title overlay on cover bottom-left */}
          <div className="absolute bottom-3 left-3 right-16">
            <h3 className="line-clamp-2 font-serif text-base font-medium leading-tight text-ivory drop-shadow-[0_2px_8px_oklch(0_0_0/0.6)]">
              {title}
            </h3>
            {doc.author && (
              <p className="mt-0.5 line-clamp-1 text-[11px] font-medium text-ivory/75 drop-shadow-[0_2px_6px_oklch(0_0_0/0.6)]">
                by {doc.author}
              </p>
            )}
          </div>

          {/* Status badge — top center-right, below delete when hovered */}
          <div className="absolute right-3 top-12 transition-transform group-hover:-translate-y-0.5">
            {statusBadge}
          </div>
        </div>

        {/* ─── Body ─── */}
        <div className="space-y-3 p-4">
          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <BookOpen className="h-3 w-3 text-amber/60" />
              {doc._count.narratives} narrative{doc._count.narratives === 1 ? '' : 's'}
            </span>
            <span className="text-amber/25">·</span>
            <span className="inline-flex items-center gap-1">
              <HardDrive className="h-3 w-3 text-amber/60" />
              {formatSize(doc.sizeBytes)}
            </span>
            <span className="text-amber/25">·</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3 text-amber/60" />
              {formatDate(doc.createdAt)}
            </span>
          </div>

          {/* Word count — real (detected) when available, else estimated */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground/80">
            {doc.wordCount != null ? (
              <span>{doc.wordCount.toLocaleString()} words</span>
            ) : (
              <span>
                <span className="font-mono text-amber/50">≈</span>{' '}
                {estimateWords(doc.sizeBytes, doc.mimeType)}
              </span>
            )}
            {doc.readingTimeMin != null && doc.readingTimeMin > 0 && (
              <>
                <span className="text-amber/25">·</span>
                <span>{doc.readingTimeMin} min read</span>
              </>
            )}
            {doc.series && (
              <>
                <span className="text-amber/25">·</span>
                <span className="line-clamp-1 italic text-amber/60">{doc.series}</span>
              </>
            )}
          </div>

          {/* Progress bar (if processing) */}
          <AnimatePresence>
            {processing && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="space-y-1.5"
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-medium uppercase tracking-wider text-amber/90">
                    {stageLabel}
                  </span>
                  <span className="font-mono tabular-nums text-amber">
                    {Math.round(liveProgress)}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-midnight">
                  <motion.div
                    className="h-full rounded-full bg-linear-to-r from-amber via-amber to-burgundy"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(2, Math.min(100, liveProgress))}%` }}
                    transition={spring.snappy}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hover action hint */}
          <AnimatePresence>
            {completed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-between border-t border-amber/10 pt-2.5"
              >
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber/80">
                  <Eye className="h-3.5 w-3.5" />
                  Read narrative
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-amber">
                  Open →
                </span>
              </motion.div>
            )}
            {processing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-between border-t border-amber/10 pt-2.5"
              >
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber/80">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Watch progress
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-amber">
                  Open →
                </span>
              </motion.div>
            )}
            {failed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-between border-t border-burgundy/20 pt-2.5"
              >
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-burgundy">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Processing failed
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </motion.div>
  )
}

// ─── Empty state ────────────────────────────────────────────────────────────

function EmptyState({
  onUpload,
  onSample,
  uploading,
}: {
  onUpload: () => void
  onSample: () => void
  uploading: boolean
}) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="flex flex-col items-center justify-center px-6 py-20 text-center"
    >
      <motion.div variants={revealFade} className="relative mb-8">
        <div
          className="pointer-events-none absolute inset-0 -m-12 rounded-full bg-amber/10 blur-3xl"
          aria-hidden
        />
        <InfinityFlow className="relative h-24 w-48 text-amber" />
      </motion.div>

      <motion.h3
        variants={revealUp}
        className="text-headline text-ivory"
      >
        Your library is empty
      </motion.h3>

      <motion.p
        variants={revealUp}
        className="mt-3 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground"
      >
        Upload a document to reconstruct it into a living narrative — or try the
        sample story and watch Lemniscate transform prose into cinema.
      </motion.p>

      <motion.div
        variants={revealUp}
        className="mt-8 flex flex-col items-center gap-3 sm:flex-row"
      >
        <Button
          onClick={onUpload}
          disabled={uploading}
          size="lg"
          className="gap-2 bg-linear-to-br from-amber to-amber/80 text-midnight shadow-glow-amber hover:from-amber/90 hover:to-amber/70"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Upload a document
        </Button>
        <Button
          onClick={onSample}
          disabled={uploading}
          variant="outline"
          size="lg"
          className="gap-2 border-amber/30 bg-transparent text-amber hover:border-amber/50 hover:bg-amber/5"
        >
          <Sparkles className="h-4 w-4" />
          Try the sample story
        </Button>
      </motion.div>

      <motion.div variants={revealFade} className="mt-10">
        <Flourish className="h-3 w-32 text-amber/30" />
      </motion.div>
    </motion.div>
  )
}

// ─── Skeleton grid (initial loading) ────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="surface-raised overflow-hidden rounded-xl border-amber/10"
        >
          <div
            className="h-44 w-full animate-pulse"
            style={{
              background:
                'linear-gradient(135deg, oklch(0.2 0.02 270) 0%, oklch(0.16 0.02 270) 100%)',
            }}
          />
          <div className="space-y-2.5 p-4">
            <div className="h-3 w-2/3 animate-pulse rounded bg-midnight/60" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-midnight/40" />
            <div className="h-2.5 w-1/3 animate-pulse rounded bg-midnight/40" />
          </div>
        </div>
      ))}
    </div>
  )
}

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
  const handleHeaderUpload = React.useCallback(
    async (file: File) => {
      setUploading(true)
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('mode', uploadMode)
        const res = await fetch('/api/documents/upload', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Upload failed')
        toast({
          title: 'Document queued',
          description: `${file.name} → ${uploadMode}. Processing has begun.`,
        })
        openProcessing(data.jobId, data.documentId)
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
