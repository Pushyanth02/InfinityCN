/**
 * cinematifier.ts — Cinematification Engine (Re-export Facade)
 *
 * This file re-exports all public APIs from the modular cinematifier engine.
 * The implementation has been decomposed into focused sub-modules under
 * src/lib/cinematifier/ for better separation of concerns:
 *
 *   - textProcessing.ts     — Text cleaning & paragraph reconstruction
 *   - chapterSegmentation.ts — Chapter boundary detection
 *   - sceneDetection.ts     — Heuristic scene break detection
 *   - parser.ts             — AI output → CinematicBlock[] parsing
 *   - aiEngine.ts           — AI-powered cinematification orchestration
 *   - offlineEngine.ts      — Offline/fallback cinematification
 *   - entities.ts           — Book & ReadingProgress entity factories
 *   - metadata.ts           — Narrative metadata extraction
 *   - pipeline.ts           — Composable CinematificationPipeline engine
 *   - index.ts              — Barrel re-export
 *
 * Existing consumers can continue importing from this file without changes.
 */

export {
    // Text Processing
    cleanExtractedText,
    reconstructParagraphs,
    formatOriginalText,
    structureDialogue,
    normalizeQuotes,
    normalizeUnicode,
    runParagraphBreakerApis,
    chooseParagraphBreakerResult,
    rebuildParagraphsWithBreakerApis,
    // Chapter Segmentation
    segmentChapters,
    extractTitle,
    splitBookIntoChapters,
    // Scene Detection
    detectSceneBreaks,
    detectOriginalModeScenes,
    segmentScenesUniversal,
    detectPOVShift,
    detectNarrativeMode,
    deriveSceneTitle,
    // Block Parser
    parseCinematifiedText,
    // AI Engine
    cinematifyText,
    // Offline Engine
    cinematifyOffline,
    // Entity Factories
    createBookFromSegments,
    createReadingProgress,
    // Metadata
    extractOverallMetadata,
    // Pipeline Engine
    CinematificationPipeline,
    TextCleaningStage,
    ParagraphReconstructionStage,
    AICinematificationStage,
    OfflineCinematificationStage,
    TextStatisticsStage,
    NarrativeAnalysisStage,
    SceneSegmentationStage,
    RendererStage,
    // Core Pipeline (Prompt 2A)
    rebuildParagraphs,
    segmentScenes,
    analyzeScene,
    applyTensionFormatting,
    cinematizeScene,
    validateOutput,
    runCorePipeline,
} from './cinematifier/index';

export type {
    NarrativeMetadata,
    PipelineStage,
    PipelineContext,
    CoreScene,
    SceneAnalysis,
    OutputValidation,
    CorePipelineSceneResult,
    CorePipelineResult,
    ParagraphBreakerOptions,
    ParagraphBreakerResult,
    ParagraphBreakerStrategy,
    Scene,
    ChapterContent,
} from './cinematifier/index';
