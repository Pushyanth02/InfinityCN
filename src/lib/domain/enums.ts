/**
 * Lemniscate — Domain Enums
 * ----------------------------------------------------------------------------
 * Authoritative enum definitions shared across the entire application.
 * These mirror the Prisma schema string values but live here so that domain,
 * service, and provider layers can reference them without importing
 * @prisma/client.
 *
 * Design rule: every enum in this file MUST be a string union, not a TS `enum`,
 * so that it is tree-shakeable and serializes naturally to/from JSON.
 */

// ─── Document lifecycle ───────────────────────────────────────────────────

export type DocumentStatus = 'UPLOADED' | 'EXTRACTED' | 'PROCESSED' | 'FAILED'

/**
 * The high-level domain category of a document. The Document Intelligence
 * Engine uses this to route to the appropriate analysis modules. New document
 * types can be added without changing existing processing paths.
 */
export type DocumentType =
  | 'NOVEL'
  | 'NOVELLA'
  | 'SHORT_STORY'
  | 'RESEARCH_PAPER'
  | 'TECHNICAL_DOC'
  | 'LEGAL_DOCUMENT'
  | 'REPORT'
  | 'MANUAL'
  | 'EDUCATIONAL'
  | 'GENERAL'

// ─── Job lifecycle ────────────────────────────────────────────────────────

export type JobStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'DEAD_LETTER'

export type PipelineStage =
  | 'QUEUED'
  | 'EXTRACT'
  | 'SEGMENT'
  | 'ORIGINAL'
  | 'CINEMATIFY'
  | 'ANALYZE'
  | 'FINALIZE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED'

export type JobMode = 'ORIGINAL' | 'CINEMATIFIED' | 'BOTH'

// ─── Narrative output ─────────────────────────────────────────────────────

export type NarrativeMode = 'ORIGINAL' | 'CINEMATIFIED'

// ─── Character & relationships ────────────────────────────────────────────

export type CharacterRole = 'PROTAGONIST' | 'ANTAGONIST' | 'SUPPORTING' | 'MINOR'

export type CharacterRoleV2 = CharacterRole

export type Gender = 'MALE' | 'FEMALE' | 'UNKNOWN'

// ─── Scene & structure ────────────────────────────────────────────────────

export type StructurePhase =
  | 'EXPOSITION'
  | 'INCITING_INCIDENT'
  | 'RISING_ACTION'
  | 'MIDPOINT'
  | 'CLIMAX'
  | 'FALLING_ACTION'
  | 'RESOLUTION'

export type SceneTimeOfDay =
  | 'DAWN'
  | 'MORNING'
  | 'DAY'
  | 'AFTERNOON'
  | 'DUSK'
  | 'NIGHT'
  | 'UNKNOWN'

export type SceneMood =
  | 'TENSE'
  | 'CALM'
  | 'JOYFUL'
  | 'SOMBER'
  | 'MYSTERIOUS'
  | 'ROMANTIC'
  | 'VIOLENT'
  | 'HOPEFUL'

// ─── Paragraphs & text ────────────────────────────────────────────────────

export type ParagraphType =
  | 'NARRATION'
  | 'DIALOGUE'
  | 'ACTION'
  | 'TRANSITION'
  | 'HEADING'
  | 'THOUGHT'

// ─── Events ───────────────────────────────────────────────────────────────

export type EventType =
  | 'ACTION'
  | 'DIALOGUE'
  | 'DISCOVERY'
  | 'CONFLICT'
  | 'RESOLUTION'
  | 'TRANSITION'

// ─── Emotion ──────────────────────────────────────────────────────────────

export type EmotionLabel =
  | 'JOY'
  | 'ANGER'
  | 'FEAR'
  | 'SADNESS'
  | 'SURPRISE'
  | 'DISGUST'
  | 'LOVE'
  | 'NEUTRAL'

// ─── Narrative arc ────────────────────────────────────────────────────────

export type ArcType = 'INCITING' | 'RISING' | 'CLIMAX' | 'FALLING' | 'RESOLUTION'

// ─── Location ─────────────────────────────────────────────────────────────

export type LocationType =
  | 'INDOOR'
  | 'OUTDOOR'
  | 'URBAN'
  | 'NATURE'
  | 'VEHICLE'
  | 'GENERIC'

// ─── Logging ──────────────────────────────────────────────────────────────

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'

// ─── API ──────────────────────────────────────────────────────────────────

export type ApiVersion = 'v1'
