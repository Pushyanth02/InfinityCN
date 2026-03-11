/**
 * cinematifier/index.ts — Barrel Export
 *
 * Re-exports all public APIs from the cinematifier engine sub-modules.
 * Consumers can import from 'lib/cinematifier' and get the same API
 * as the original monolithic file, plus the new pipeline engine.
 */

// ─── Text Processing ───────────────────────────────────────
export { cleanExtractedText, reconstructParagraphs } from './textProcessing';

// ─── Chapter Segmentation ──────────────────────────────────
export { segmentChapters } from './chapterSegmentation';

// ─── Scene Detection ───────────────────────────────────────
export { detectSceneBreaks } from './sceneDetection';

// ─── Block Parser ──────────────────────────────────────────
export { parseCinematifiedText } from './parser';

// ─── AI Engine ─────────────────────────────────────────────
export { cinematifyText } from './aiEngine';

// ─── Offline Engine ────────────────────────────────────────
export { cinematifyOffline } from './offlineEngine';

// ─── Entity Factories ──────────────────────────────────────
export { createBookFromSegments, createReadingProgress } from './entities';

// ─── Metadata ──────────────────────────────────────────────
export { extractOverallMetadata } from './metadata';
export type { NarrativeMetadata } from './metadata';

// ─── Pipeline Engine ───────────────────────────────────────
export {
    CinematificationPipeline,
    TextCleaningStage,
    ParagraphReconstructionStage,
    AICinematificationStage,
    OfflineCinematificationStage,
} from './pipeline';
export type { PipelineStage, PipelineContext } from './pipeline';
