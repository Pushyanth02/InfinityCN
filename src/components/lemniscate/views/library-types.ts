/**
 * Lemniscate — Shared library types
 * ----------------------------------------------------------------------------
 * The library view's domain model, shared between `library.tsx` and its
 * extracted sub-components. Kept standalone so components can be split out of
 * the library monolith without circular imports.
 */

export interface DocJob {
  id: string
  mode: string
  status: string
  progress: number
  stage: string | null
}

export interface LibraryDocument {
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

export interface StatsResponse {
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

export type FilterKey = 'all' | 'processing' | 'completed' | 'original' | 'cinematified'
export type SortKey = 'recent' | 'name' | 'size'
