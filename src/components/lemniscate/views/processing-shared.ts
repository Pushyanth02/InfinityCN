/**
 * Lemniscate — Processing view shared types & stage config
 * ----------------------------------------------------------------------------
 * The job/document/narrative shapes polled by the processing view plus the
 * ordered pipeline-stage descriptors. Extracted verbatim from `processing.tsx`;
 * behavior is unchanged.
 */

import { FileSearch, Layers, Film, Type, ScanLine, Sparkles } from 'lucide-react'

export interface ProcessingNarrative {
  id: string
  mode: string
  title: string
  sceneCount: number
}

export interface ProcessingJob {
  stage?: string
  progress?: number
  status?: string
  mode?: string
  error?: string | null
  narratives?: ProcessingNarrative[]
}

export interface ProcessingDoc {
  originalName?: string
}

export const STAGES = [
  { key: 'EXTRACT', label: 'Extract', icon: FileSearch, desc: 'Reading the source document' },
  { key: 'SEGMENT', label: 'Segment', icon: ScanLine, desc: 'Splitting into sentences & paragraphs' },
  { key: 'ORIGINAL', label: 'Original', icon: Type, desc: 'Reconstructing paragraphs' },
  { key: 'CINEMATIFY', label: 'Cinematify', icon: Film, desc: 'Detecting scenes & characters' },
  { key: 'ANALYZE', label: 'Analyze', icon: Layers, desc: 'Scoring tension & emotion' },
  { key: 'FINALIZE', label: 'Finalize', icon: Sparkles, desc: 'Persisting narrative artifacts' },
] as const
