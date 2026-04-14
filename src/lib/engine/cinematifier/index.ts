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
    formatOriginalText,
    structureDialogue,
    normalizeQuotes,
    normalizeUnicode,
} from './textProcessing';

// ─── Paragraph Breaker APIs ───────────────────────────────
export {
    runParagraphBreakerApis,
    chooseParagraphBreakerResult,
    rebuildParagraphsWithBreakerApis,
} from './paragraphBreakers';
export type {
    ParagraphBreakerOptions,
    ParagraphBreakerResult,
    ParagraphBreakerStrategy,
} from './paragraphBreakers';

// ─── Chapter Segmentation ──────────────────────────────────
export { segmentChapters, extractTitle, splitBookIntoChapters } from './chapterSegmentation';
export type { ChapterContent } from './chapterSegmentation';

// ─── Scene Detection ───────────────────────────────────────
export {
    detectSceneBreaks,
    detectOriginalModeScenes,
    segmentScenesUniversal,
    detectPOVShift,
    detectNarrativeMode,
    deriveSceneTitle,
} from './sceneDetection';
export type { Scene } from './sceneDetection';

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
    NarrativeAnalysisStage,
    SceneSegmentationStage,
    RendererStage,
} from './pipeline';
export type { PipelineStage, PipelineContext } from './pipeline';

// ─── Core Pipeline (Prompt 2A) ─────────────────────────────
export {
    rebuildParagraphs,
    segmentScenes,
    analyzeScene,
    applyTensionFormatting,
    cinematizeScene,
    validateOutput,
    runCorePipeline,
} from './corePipeline';
export type {
    CoreScene,
    SceneAnalysis,
    OutputValidation,
    CorePipelineSceneResult,
    CorePipelineResult,
} from './corePipeline';

// ─── Unified Chapter Engine ───────────────────────────────
export {
    createChapterPipeline,
    createPreprocessedChapterPipeline,
    runChapterEngine,
} from './chapterEngine';
export type { ChapterEngineOptions } from './chapterEngine';

// ─── Full System Pipeline ──────────────────────────────────
export {
    runFullSystemPipeline,
    clearFullSystemPipelineCache,
    getFullSystemPipelineCacheSize,
} from './fullSystemPipeline';
export type {
    FullSystemPipelineOptions,
    FullSystemPipelineResult,
    OriginalModeResult,
} from './fullSystemPipeline';
