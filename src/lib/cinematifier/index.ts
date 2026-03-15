/**
 * cinematifier/index.ts — Barrel Export
 *
 * Re-exports all public APIs from the cinematifier engine sub-modules.
 * Consumers can import from 'lib/cinematifier' and get the same API
 * as the original monolithic file, plus the new pipeline engine.
 */

// ─── Text Processing ───────────────────────────────────────
export {
    cleanExtractedText,
    reconstructParagraphs,
    normalizeQuotes,
    normalizeUnicode,
} from './textProcessing';

// ─── Chapter Segmentation ──────────────────────────────────
export { segmentChapters } from './chapterSegmentation';

// ─── Scene Detection ───────────────────────────────────────
export { detectSceneBreaks, detectPOVShift, detectNarrativeMode } from './sceneDetection';

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

// ─── Readability Analysis ──────────────────────────────────
export { analyzeReadability, countSyllables, getDifficultyLabel } from './readability';
export type { ReadabilityMetrics, ReadabilityLevel } from './readability';

// ─── Sentiment Tracker ─────────────────────────────────────
export { analyzeSentiment, analyzeSentimentFlow, scoreToEmotion } from './sentimentTracker';
export type { SentimentResult, SentimentFlowPoint, SentimentFlowResult } from './sentimentTracker';

// ─── Pacing Analyzer ───────────────────────────────────────
export { analyzePacing } from './pacingAnalyzer';
export type { PacingMetrics, PacingIssue, PacingRhythm } from './pacingAnalyzer';

// ─── Pipeline Engine ───────────────────────────────────────
export {
    CinematificationPipeline,
    TextCleaningStage,
    ParagraphReconstructionStage,
    AICinematificationStage,
    OfflineCinematificationStage,
    ReadabilityAnalysisStage,
    SentimentEnrichmentStage,
    PacingAnalysisStage,
    TextStatisticsStage,
} from './pipeline';
export type { PipelineStage, PipelineContext } from './pipeline';
