/**
 * Lemniscate — Shared library helpers
 * ----------------------------------------------------------------------------
 * Data constants, the deterministic cover-gradient generator, and formatting
 * helpers, shared between `library.tsx` and its extracted sub-components. Kept
 * standalone so components can be split out of the library monolith without
 * duplicating helpers or creating circular imports.
 */
import type { DocJob, LibraryDocument } from './library-types'

// ─── Constants ──────────────────────────────────────────────────────────────

export const ACCEPTED = '.pdf,.docx,.doc,.txt,.md'
export const POLL_INTERVAL = 5000

export const STAGE_LABEL: Record<string, string> = {
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

export const FILE_TYPE_META: Record<
  string,
  { label: string; tint: string }
> = {
  pdf: { label: 'PDF', tint: 'oklch(0.55 0.2 22)' },
  docx: { label: 'DOC', tint: 'oklch(0.6 0.15 290)' },
  doc: { label: 'DOC', tint: 'oklch(0.6 0.15 290)' },
  txt: { label: 'TXT', tint: 'oklch(0.6 0.14 165)' },
  md: { label: 'MD', tint: 'oklch(0.72 0.15 55)' },
}

// ─── Cover gradient generator (deterministic from file hash) ─────────────────

export interface CoverDesign {
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

export function coverFromHash(hash: string): CoverDesign {
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

export function getFileType(name: string): { ext: string; label: string; tint: string } {
  const ext = name.split('.').pop()?.toLowerCase() || 'file'
  const meta = FILE_TYPE_META[ext] || {
    label: ext.toUpperCase().slice(0, 3),
    tint: 'oklch(0.72 0.15 55)',
  }
  return { ext, ...meta }
}

export function stripExt(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx > 0 ? name.slice(0, idx) : name
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDate(iso: string): string {
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

export function estimateWords(sizeBytes: number, mimeType: string): string {
  // Rough estimate: text ~6 bytes/word; PDF/DOCX compressed payload is larger
  // than extracted text, so use a conservative divisor.
  const divisor = mimeType.includes('pdf') || mimeType.includes('officedocument') ? 18 : 6
  const words = Math.max(1, Math.round(sizeBytes / divisor))
  if (words >= 1000) return `${(words / 1000).toFixed(1)}k words`
  return `${words} words`
}

export function isProcessingJob(j?: DocJob): boolean {
  return !!j && (j.status === 'QUEUED' || j.status === 'PROCESSING')
}

export function isCompletedDoc(doc: LibraryDocument): boolean {
  return (doc.status === 'PROCESSED' || doc.status === 'COMPLETED') && doc._count.narratives > 0
}

// ─── Upload ─────────────────────────────────────────────────────────────────

/** Result of a successful upload — the IDs the caller needs to navigate to the
 *  processing view. Errors are thrown (the caller surfaces them via a toast). */
export interface UploadResult {
  jobId: string
  documentId: string
}

/**
 * POST a file to the upload endpoint with the given transformation mode.
 *
 * Shared by the library header button and the upload-zone drop area so the
 * FormData construction, error parsing, and response shape live in one place.
 * Throws an `Error` with a user-safe message on a non-OK response.
 */
export async function uploadDocument(
  file: File,
  mode: string,
): Promise<UploadResult> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('mode', mode)
  const res = await fetch('/api/documents/upload', { method: 'POST', body: fd })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error || 'Upload failed')
  }
  return { jobId: data.jobId, documentId: data.documentId }
}
