/**
 * Shared types for the Lemniscate queue + pipeline.
 */

export interface JobPayload {
  jobId: string
  documentId: string
  mode: 'ORIGINAL' | 'CINEMATIFIED' | 'BOTH'
  priority: number
  attempts?: number
  enqueuedAt: number
}

export interface JobAck {
  id: string
  status: 'completed' | 'failed'
  error?: string
  durationMs?: number
}

/** Stage names emitted during processing. */
export type PipelineStage =
  | 'QUEUED'
  | 'EXTRACT'
  | 'SEGMENT'
  | 'ORIGINAL'
  | 'CINEMATIFY'
  | 'ANALYZE'
  | 'FINALIZE'
  | 'COMPLETED'
  | 'FAILED'

/** A real-time progress event sent over WebSocket. */
export interface ProgressEvent {
  type: 'progress' | 'stage' | 'log' | 'complete' | 'error'
  jobId: string
  documentId?: string
  stage?: PipelineStage
  progress?: number
  message?: string
  level?: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'
  timestamp: number
  result?: {
    narrativeIds?: string[]
    sceneCount?: number
    characterCount?: number
    durationMs?: number
  }
}

// ---------------------------------------------------------------------------
// API response shapes — used by frontend components
// ---------------------------------------------------------------------------

export type NarrativeMode = 'ORIGINAL' | 'CINEMATIFIED'
export type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'DEAD_LETTER'
export type DocumentStatus = 'UPLOADED' | 'EXTRACTED' | 'PROCESSED' | 'FAILED'
export type CharacterRole = 'PROTAGONIST' | 'ANTAGONIST' | 'SUPPORTING' | 'MINOR'
export type EventType = 'ACTION' | 'DIALOGUE' | 'DISCOVERY' | 'CONFLICT' | 'RESOLUTION' | 'TRANSITION'
export type ParagraphType = 'NARRATION' | 'DIALOGUE' | 'ACTION' | 'TRANSITION' | 'HEADING' | 'THOUGHT'
export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'

/** Job as returned by GET /api/jobs/[id] */
export interface ApiJob {
  id: string
  documentId: string
  mode: string
  status: JobStatus
  progress: number
  stage: string | null
  error: string | null
  priority: number
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  durationMs: number | null
  narratives: ApiNarrativeSummary[]
}

/** Document as returned by GET /api/documents/[id] */
export interface ApiDocument {
  id: string
  originalName: string
  storageName: string
  mimeType: string
  sizeBytes: number
  fileHash: string
  status: DocumentStatus
  createdAt: string
  updatedAt: string
}

/** Narrative summary — returned in job.narratives and /api/documents/[id]/narratives */
export interface ApiNarrativeSummary {
  id: string
  mode: NarrativeMode
  title: string
  sceneCount: number
  wordCount?: number
  readingTimeMin?: number
  paragraphCount?: number
  createdAt?: string
}

/** Character as returned in narrative response */
export interface ApiCharacter {
  id: string
  name: string
  /** Stored as JSON string in DB — coerce to string[] before use */
  aliases: string | string[]
  mentions: number
  firstAppearanceOffset: number
  role: CharacterRole
  dialogueLines: number
  description: string | null
  // Narrative Intelligence Engine v2 — promoted scalar metrics.
  importanceScore: number
  confidenceScore: number
  speakingCount: number
  lastAppearanceOffset: number
  /** JSON string: { id, honorifics: string[], gender, scenes: number[] } */
  metadata: string
}

/** Parsed character metadata blob (Character.metadata JSON). */
export interface CharacterMetadata {
  id?: string
  honorifics?: string[]
  gender?: 'MALE' | 'FEMALE' | 'UNKNOWN'
  scenes?: number[]
}

/** Ranked character entry (intelligence rankings). */
export interface ApiRankedCharacter {
  id: string
  name: string
  score: number
}

/** Character intelligence blob persisted in Narrative.metadata. */
export interface ApiCharacterIntelligence {
  protagonistRanking: ApiRankedCharacter[]
  supportingRanking: ApiRankedCharacter[]
  antagonistId: string | null
  viewpointId: string | null
  narrativeFocus: number
  speakingDominance: number
  sceneParticipation: number
}

/** One point on the persisted emotional timeline. */
export interface ApiEmotionTimelinePoint {
  sceneIndex: number
  valence: number
  arousal: number
  dominant: string
}

/** One point on the persisted momentum timeline. */
export interface ApiMomentumPoint {
  sceneIndex: number
  score: number
}

/** Structural phase segment persisted in Narrative.metadata. */
export interface ApiStructureSegment {
  phase: string
  startSceneIndex: number
  endSceneIndex: number
  confidence: number
}

/** Story-structure blob persisted in Narrative.metadata. */
export interface ApiStoryStructure {
  segments: ApiStructureSegment[]
  incitingIncidentScene: number
  midpointScene: number
  climaxScene: number
}

/** Full analysis metadata parsed from Narrative.metadata (cinematified). */
export interface ApiNarrativeMetadata {
  intelligence?: ApiCharacterIntelligence
  emotionTimeline?: ApiEmotionTimelinePoint[]
  momentumTimeline?: ApiMomentumPoint[]
  structure?: ApiStoryStructure
}

/** Location as returned in narrative response */
export interface ApiLocation {
  id: string
  name: string
  mentions: number
  type: string
  firstAppearanceOffset: number
}

/** Event as returned in narrative response */
export interface ApiEvent {
  id: string
  index: number
  type: EventType
  description: string
  /** JSON string of participant names */
  participants: string | string[]
  offset: number
  intensity: number
  sceneId: string | null
}

/** Narrative arc as returned in narrative response */
export interface ApiNarrativeArc {
  id: string
  name: string
  arcType: string
  startSceneIdx: number
  endSceneIdx: number
  intensity: number
  summary: string
}

/** Emotional peak as returned in narrative response */
export interface ApiEmotionalPeak {
  id: string
  offset: number
  intensity: number
  emotion: string
  snippet: string
  sceneId: string | null
}

/** Paragraph as returned in narrative response */
export interface ApiParagraph {
  id: string
  index: number
  text: string
  type: ParagraphType
  speaker: string | null
  rawText: string | null
  wordCount: number
  charCount: number
  startOffset: number
  endOffset: number
}

/** Scene as returned in narrative response */
export interface ApiScene {
  id: string
  index: number
  title: string
  summary: string
  location: string | null
  timeOfDay: string | null
  mood: string | null
  tensionScore: number
  emotionScore: number
  // Narrative Intelligence Engine v2 — promoted scalar metrics.
  momentumScore: number
  arousalScore: number
  valence: number
  structurePhase: string | null
  startOffset: number
  endOffset: number
  charCount: number
  paragraphCount: number
  dialogueRatio: number
  eventCount: number
  events: ApiEvent[]
  paragraphs?: ApiParagraph[]
}

/** Full narrative as returned by GET /api/narratives/[id] */
export interface ApiNarrative {
  id: string
  documentId: string
  jobId: string
  mode: NarrativeMode
  title: string
  content: string
  plainText: string
  wordCount: number
  charCount: number
  readingTimeMin: number
  paragraphCount: number
  sceneCount: number
  metadata: string
  createdAt: string
  document: {
    id: string
    originalName: string
    status: DocumentStatus
  }
  paragraphs: ApiParagraph[]
  scenes: ApiScene[]
  characters: ApiCharacter[]
  locations: ApiLocation[]
  arcs: ApiNarrativeArc[]
  peaks: ApiEmotionalPeak[]
  events?: ApiEvent[]
}

/** Document list item from GET /api/documents */
export interface ApiDocumentListItem {
  id: string
  originalName: string
  mimeType: string
  sizeBytes: number
  status: DocumentStatus
  createdAt: string
  fileHash: string
  _count: { jobs: number; narratives: number }
  jobs: Array<{
    id: string
    mode: string
    status: JobStatus
    progress: number
    stage: string | null
  }>
}

/** Stats response from GET /api/stats */
export interface ApiStats {
  counts: {
    documents: number
    jobs: number
    narratives: number
    scenes: number
    characters: number
    events: number
    peaks: number
  }
  byStatus: Array<{ status: string; _count: number }>
  byJobStatus: Array<{ status: string; _count: number }>
  byMode: Array<{ mode: string; _count: number }>
  recentJobs: ApiJob[]
}
