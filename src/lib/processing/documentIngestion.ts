/**
 * documentIngestion.ts — Document Ingestion Pipeline
 *
 * Unified pipeline: File → Extract → Clean → Normalize → Detect Chapters → NarrativeDocument
 *
 * Supports: PDF, DOCX, EPUB, PPTX, TXT
 * Features:
 *   - Corrupted file recovery
 *   - OCR fallback for scanned documents (via pdfWorker's tesseract.js integration)
 *   - Multi-stage progress reporting
 *   - Error classification (corrupted / scanned / empty / encrypted / unsupported)
 *   - Quality gates between pipeline stages
 *   - Integration with the deterministic TextProcessingEngine
 *
 * Constraint: raw text NEVER reaches UI directly — always passes through the engine.
 */

import {
    extractText,
    detectFormat,
    type SupportedFormat,
    type ExtractionProgressCallback,
} from './pdfWorker';
import {
    cleanExtractedText,
    segmentChapters,
    extractTitle,
    processText,
} from '../cinematifier';
import type {
    NarrativeDocument,
    TextProcessingOptions,
} from '../engine/cinematifier/textProcessingEngine';
import type { ChapterSegment } from '../../types/cinematifier';

// ─── Error Classification ──────────────────────────────────────────────────────

export type IngestionErrorCode =
    | 'FILE_TOO_LARGE'
    | 'FILE_EMPTY'
    | 'UNSUPPORTED_FORMAT'
    | 'LEGACY_FORMAT'
    | 'CORRUPTED_FILE'
    | 'IMAGE_ONLY_PDF'
    | 'MALFORMED_XREF'
    | 'DAMAGED_PAGES'
    | 'ENCRYPTED_FILE'
    | 'EXTRACTION_FAILED'
    | 'OCR_FAILED'
    | 'INSUFFICIENT_TEXT'
    | 'NO_CHAPTERS_DETECTED'
    | 'PIPELINE_ABORTED'
    | 'UNKNOWN_ERROR';

export class IngestionError extends Error {
    public readonly code: IngestionErrorCode;
    public readonly stage: IngestionStage;
    public readonly recoverable: boolean;
    public readonly userMessage: string;

    constructor(opts: {
        code: IngestionErrorCode;
        stage: IngestionStage;
        message: string;
        userMessage: string;
        recoverable?: boolean;
        cause?: unknown;
    }) {
        super(opts.message, { cause: opts.cause });
        this.name = 'IngestionError';
        this.code = opts.code;
        this.stage = opts.stage;
        this.recoverable = opts.recoverable ?? false;
        this.userMessage = opts.userMessage;
    }
}

/** Classify raw errors into structured IngestionErrors */
function classifyError(error: unknown, stage: IngestionStage): IngestionError {
    const msg = error instanceof Error ? error.message : String(error);
    const lower = msg.toLowerCase();

    if (lower.includes('too large') || lower.includes('maximum allowed size')) {
        return new IngestionError({
            code: 'FILE_TOO_LARGE',
            stage,
            message: msg,
            userMessage: 'File exceeds the 50 MB upload limit. Try a smaller file.',
            recoverable: false,
            cause: error,
        });
    }

    if (lower.includes('legacy') || lower.includes('.doc format')) {
        return new IngestionError({
            code: 'LEGACY_FORMAT',
            stage,
            message: msg,
            userMessage: 'Legacy format detected. Please save the file as DOCX and retry.',
            recoverable: false,
            cause: error,
        });
    }

    if (lower.includes('unsupported')) {
        return new IngestionError({
            code: 'UNSUPPORTED_FORMAT',
            stage,
            message: msg,
            userMessage: 'Unsupported file format. We accept PDF, DOCX, EPUB, PPTX, and TXT.',
            recoverable: false,
            cause: error,
        });
    }

    if (lower.includes('image-only pdf') || lower.includes('image based')) {
        return new IngestionError({
            code: 'IMAGE_ONLY_PDF',
            stage,
            message: msg,
            userMessage:
                'This PDF appears image-only. OCR recovered limited text; try a higher-quality scan or OCR-enabled export.',
            recoverable: true,
            cause: error,
        });
    }

    if (lower.includes('xref') || lower.includes('cross-reference')) {
        return new IngestionError({
            code: 'MALFORMED_XREF',
            stage,
            message: msg,
            userMessage:
                'The PDF has a malformed cross-reference table (xref). Please re-export the file and retry.',
            recoverable: false,
            cause: error,
        });
    }

    if (lower.includes('damaged page') || lower.includes('damaged pages')) {
        return new IngestionError({
            code: 'DAMAGED_PAGES',
            stage,
            message: msg,
            userMessage:
                'Some pages in this PDF are damaged. We recovered what we could; review extracted content before continuing.',
            recoverable: true,
            cause: error,
        });
    }

    if (lower.includes('encrypted') || lower.includes('drm') || lower.includes('password')) {
        return new IngestionError({
            code: 'ENCRYPTED_FILE',
            stage,
            message: msg,
            userMessage: 'This file appears to be encrypted or DRM-protected. Please provide an unprotected copy.',
            recoverable: false,
            cause: error,
        });
    }

    if (lower.includes('corrupted') || lower.includes('malformed') || lower.includes('invalid')) {
        return new IngestionError({
            code: 'CORRUPTED_FILE',
            stage,
            message: msg,
            userMessage: 'The file appears to be corrupted. Try re-exporting it from the original source.',
            recoverable: false,
            cause: error,
        });
    }

    if (lower.includes('ocr')) {
        return new IngestionError({
            code: 'OCR_FAILED',
            stage,
            message: msg,
            userMessage: 'OCR processing failed on scanned pages. The text may be incomplete.',
            recoverable: true,
            cause: error,
        });
    }

    return new IngestionError({
        code: stage === 'extracting' ? 'EXTRACTION_FAILED' : 'UNKNOWN_ERROR',
        stage,
        message: msg,
        userMessage: `Processing failed during ${stage}: ${msg}`,
        recoverable: true,
        cause: error,
    });
}

// ─── Pipeline Types ────────────────────────────────────────────────────────────

export type IngestionStage =
    | 'validating'
    | 'extracting'
    | 'cleaning'
    | 'normalizing'
    | 'detecting_chapters'
    | 'processing_text'
    | 'complete';

export interface IngestionProgress {
    stage: IngestionStage;
    percentComplete: number;
    message: string;
    format?: SupportedFormat;
    /** Pages processed (PDF only) */
    pagesProcessed?: number;
    /** Total pages (PDF only) */
    totalPages?: number;
    /** Whether OCR was triggered */
    ocrTriggered?: boolean;
    ocrPageRatio?: number;
    ocrAverageConfidence?: number;
    lowConfidenceExtraction?: boolean;
    damagedPages?: number;
}

export type IngestionProgressCallback = (progress: IngestionProgress) => void;

export interface IngestionOptions {
    /** Callback for progress updates */
    onProgress?: IngestionProgressCallback;
    /** Abort signal for cancellation */
    signal?: AbortSignal;
    /** Minimum extracted text length to proceed (default: 100) */
    minTextLength?: number;
    /** Options for the text processing engine */
    textProcessingOptions?: TextProcessingOptions;
}

/** A chapter detected during ingestion */
export interface IngestedChapter {
    title: string;
    content: string;
    /** Structured narrative data from the text processing engine */
    narrative: NarrativeDocument;
    startIndex: number;
    endIndex: number;
}

/** Complete result of document ingestion */
export interface IngestionResult {
    /** Detected file format */
    format: SupportedFormat;
    /** Detected or inferred document title */
    title: string;
    /** Total word count across all chapters */
    totalWords: number;
    /** Ingested chapters with structured narrative data */
    chapters: IngestedChapter[];
    /** Full cleaned text (for book-level operations) */
    cleanedText: string;
    /** Full narrative document (for book-level analysis) */
    fullNarrative: NarrativeDocument;
    /** Processing duration in ms */
    processingTimeMs: number;
    /** Whether OCR was used during extraction */
    ocrUsed: boolean;
    ocrQuality: {
        ocrPageRatio: number;
        ocrAverageConfidence?: number;
        lowConfidenceExtraction: boolean;
    };
    chapterDetectionTier: 'chapter_regex' | 'scene_split' | 'single_chapter_safe_mode';
    telemetry: {
        stageDurationMs: Partial<Record<IngestionStage, number>>;
        totalDurationMs: number;
        ocrUsageRate: number;
        chapterDetectionFailures: number;
        userAborted: boolean;
    };
    /** Warnings accumulated during processing */
    warnings: string[];
}

// ─── Quality Gates ─────────────────────────────────────────────────────────────

const MIN_TEXT_LENGTH = 100;
const MIN_WORD_COUNT = 20;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const CHECKPOINT_KEY = 'infinitycn:ingestion-checkpoints:v1';
const MAX_STORED_CHECKPOINTS = 10;
const LOW_CONFIDENCE_OCR_RATIO_THRESHOLD = 0.35;
const LOW_CONFIDENCE_OCR_CONFIDENCE_THRESHOLD = 65;

function validateFile(file: File): SupportedFormat {
    if (!file.name.trim()) {
        throw new IngestionError({
            code: 'FILE_EMPTY',
            stage: 'validating',
            message: 'File has no name.',
            userMessage: 'Invalid file: missing filename.',
        });
    }

    if (file.size <= 0) {
        throw new IngestionError({
            code: 'FILE_EMPTY',
            stage: 'validating',
            message: 'File is empty (0 bytes).',
            userMessage: 'The selected file is empty.',
        });
    }

    if (file.size > MAX_FILE_SIZE) {
        throw new IngestionError({
            code: 'FILE_TOO_LARGE',
            stage: 'validating',
            message: `File size ${file.size} exceeds limit.`,
            userMessage: 'File exceeds the 50 MB upload limit.',
        });
    }

    try {
        return detectFormat(file);
    } catch (err) {
        throw classifyError(err, 'validating');
    }
}

function validateExtractedText(text: string, minLength: number): void {
    if (!text || text.trim().length < minLength) {
        throw new IngestionError({
            code: 'INSUFFICIENT_TEXT',
            stage: 'extracting',
            message: `Extracted text is too short (${text.trim().length} chars, minimum ${minLength}).`,
            userMessage: 'Could not extract enough text. The file may be image-based, empty, or encrypted.',
            recoverable: false,
        });
    }

    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < MIN_WORD_COUNT) {
        throw new IngestionError({
            code: 'INSUFFICIENT_TEXT',
            stage: 'extracting',
            message: `Only ${wordCount} words extracted (minimum ${MIN_WORD_COUNT}).`,
            userMessage: 'The extracted text is too short to process as a narrative document.',
            recoverable: false,
        });
    }
}

function validateChapters(chapters: ChapterSegment[]): void {
    if (chapters.length === 0) {
        throw new IngestionError({
            code: 'NO_CHAPTERS_DETECTED',
            stage: 'detecting_chapters',
            message: 'No chapters detected.',
            userMessage: 'Could not detect readable chapters from the uploaded text.',
            recoverable: false,
        });
    }
}

// ─── Progress Helpers ──────────────────────────────────────────────────────────

/** Stage progress ranges (percentComplete) */
const STAGE_RANGES: Record<IngestionStage, [number, number]> = {
    validating: [0, 5],
    extracting: [5, 45],
    cleaning: [45, 55],
    normalizing: [55, 65],
    detecting_chapters: [65, 75],
    processing_text: [75, 98],
    complete: [100, 100],
};

function emitProgress(
    callback: IngestionProgressCallback | undefined,
    stage: IngestionStage,
    localPercent: number,
    message: string,
    extra?: Partial<IngestionProgress>,
): void {
    if (!callback) return;
    const [start, end] = STAGE_RANGES[stage];
    const clamped = Math.max(0, Math.min(100, localPercent));
    const percentComplete = Math.round(start + ((end - start) * clamped) / 100);

    callback({
        stage,
        percentComplete,
        message,
        ...extra,
    });
}

function checkAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw new IngestionError({
            code: 'PIPELINE_ABORTED',
            stage: 'extracting',
            message: 'Ingestion was cancelled.',
            userMessage: 'Processing was cancelled.',
            recoverable: false,
        });
    }
}

type IngestionCheckpoint = {
    key: string;
    format: SupportedFormat;
    rawText?: string;
    normalizedText?: string;
    updatedAt: number;
};

function getStorage(): Storage | null {
    if (typeof window === 'undefined') return null;
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function checkpointKeyForFile(file: File): string {
    return `${file.name}:${file.size}:${file.lastModified}`;
}

function readCheckpoint(file: File): IngestionCheckpoint | null {
    const storage = getStorage();
    if (!storage) return null;
    try {
        const raw = storage.getItem(CHECKPOINT_KEY);
        if (!raw) return null;
        const checkpoints = JSON.parse(raw) as IngestionCheckpoint[];
        const key = checkpointKeyForFile(file);
        return checkpoints.find(item => item.key === key) ?? null;
    } catch {
        return null;
    }
}

function writeCheckpoint(next: IngestionCheckpoint): void {
    const storage = getStorage();
    if (!storage) return;
    try {
        const raw = storage.getItem(CHECKPOINT_KEY);
        const checkpoints = raw ? (JSON.parse(raw) as IngestionCheckpoint[]) : [];
        const filtered = checkpoints.filter(item => item.key !== next.key);
        filtered.unshift(next);
        storage.setItem(
            CHECKPOINT_KEY,
            JSON.stringify(filtered.slice(0, MAX_STORED_CHECKPOINTS)),
        );
    } catch {
        // no-op
    }
}

function clearCheckpoint(file: File): void {
    const storage = getStorage();
    if (!storage) return;
    try {
        const raw = storage.getItem(CHECKPOINT_KEY);
        if (!raw) return;
        const checkpoints = JSON.parse(raw) as IngestionCheckpoint[];
        const key = checkpointKeyForFile(file);
        storage.setItem(
            CHECKPOINT_KEY,
            JSON.stringify(checkpoints.filter(item => item.key !== key)),
        );
    } catch {
        // no-op
    }
}

function detectChaptersByStructuralMarkers(text: string): ChapterSegment[] {
    const markers = text.split(/\n\s*(?:scene|part)\s+[\divxlcdm]+[:.\- ]/iu).filter(Boolean);
    if (markers.length < 2) return [];
    let offset = 0;
    return markers.map((content, index) => {
        const trimmed = content.trim();
        const startIndex = text.indexOf(trimmed, offset);
        const endIndex = startIndex + trimmed.length;
        offset = endIndex;
        return {
            title: `Scene ${index + 1}`,
            content: trimmed,
            startIndex: Math.max(0, startIndex),
            endIndex: Math.max(0, endIndex),
        };
    });
}

// ─── Main Pipeline ─────────────────────────────────────────────────────────────

/**
 * Run the full document ingestion pipeline.
 *
 * File → Validate → Extract → Clean → Normalize → Detect Chapters → Process Text → Result
 *
 * This is the ONLY entry point for getting document data into the system.
 * Raw text NEVER reaches UI directly.
 */
export async function ingestDocument(
    file: File,
    options: IngestionOptions = {},
): Promise<IngestionResult> {
    const startTime = performance.now();
    const warnings: string[] = [];
    let ocrUsed = false;
    let ocrPageRatio = 0;
    let ocrAverageConfidence: number | undefined;
    let lowConfidenceExtraction = false;
    let damagedPages = 0;
    let chapterDetectionFailures = 0;
    const stageStartedAt = new Map<IngestionStage, number>();
    const stageDurationMs: Partial<Record<IngestionStage, number>> = {};
    const minTextLength = options.minTextLength ?? MIN_TEXT_LENGTH;
    const checkpoint = readCheckpoint(file);

    // ── Stage 1: Validate ────────────────────────────────────
    stageStartedAt.set('validating', performance.now());
    emitProgress(options.onProgress, 'validating', 0, `Validating ${file.name}...`);
    const format = validateFile(file);
    stageDurationMs.validating = Math.round(performance.now() - (stageStartedAt.get('validating') ?? 0));
    emitProgress(options.onProgress, 'validating', 100, 'File validated.', { format });

    checkAborted(options.signal);

    // ── Stage 2: Extract Text ────────────────────────────────
    stageStartedAt.set('extracting', performance.now());
    emitProgress(options.onProgress, 'extracting', 0, 'Initializing extraction engine...', { format });

    let rawText: string;
    if (checkpoint?.rawText && checkpoint.format === format) {
        rawText = checkpoint.rawText;
        emitProgress(options.onProgress, 'extracting', 100, 'Resumed extracted text from checkpoint.', {
            format,
        });
    } else {
        try {
            const extractionCallback: ExtractionProgressCallback = (update) => {
                if (update.stage === 'ocr') ocrUsed = true;
                ocrPageRatio = update.ocrPageRatio ?? ocrPageRatio;
                ocrAverageConfidence = update.ocrAverageConfidence ?? ocrAverageConfidence;
                lowConfidenceExtraction = update.lowConfidenceExtraction ?? lowConfidenceExtraction;
                damagedPages = update.damagedPages ?? damagedPages;
                emitProgress(
                    options.onProgress,
                    'extracting',
                    update.percentComplete,
                    update.message,
                    {
                        format,
                        pagesProcessed: update.pagesProcessed,
                        totalPages: update.totalPages,
                        ocrTriggered: ocrUsed,
                        ocrPageRatio,
                        ocrAverageConfidence,
                        lowConfidenceExtraction,
                        damagedPages,
                    },
                );
            };

            rawText = await extractText(file, extractionCallback);
        } catch (err) {
            throw classifyError(err, 'extracting');
        }
    }
    stageDurationMs.extracting = Math.round(performance.now() - (stageStartedAt.get('extracting') ?? 0));

    checkAborted(options.signal);

    // ── Quality Gate: Minimum Text ───────────────────────────
    validateExtractedText(rawText, minTextLength);

    // Persist checkpoint only after the extracted text passes validation so
    // retries for the same file do not keep reusing garbled/too-short text.
    writeCheckpoint({
        key: checkpointKeyForFile(file),
        format,
        rawText,
        updatedAt: Date.now(),
    });

    // ── Stage 3: Clean Artifacts ─────────────────────────────
    stageStartedAt.set('cleaning', performance.now());
    emitProgress(options.onProgress, 'cleaning', 0, 'Removing document artifacts...', { format });

    let cleanedText: string;
    try {
        cleanedText = cleanExtractedText(rawText);
    } catch (err) {
        warnings.push(`Cleaning stage encountered issues: ${err instanceof Error ? err.message : String(err)}`);
        cleanedText = rawText; // fallback: use raw text
    }

    // Re-validate after cleaning (cleaning might strip content)
    if (cleanedText.trim().length < minTextLength) {
        // Try with raw text if cleaning was too aggressive
        cleanedText = rawText;
        warnings.push('Artifact cleaning was too aggressive; using raw extracted text.');
    }

    emitProgress(options.onProgress, 'cleaning', 100, 'Artifacts removed.', { format });
    stageDurationMs.cleaning = Math.round(performance.now() - (stageStartedAt.get('cleaning') ?? 0));

    checkAborted(options.signal);

    // ── Stage 4: Normalize ───────────────────────────────────
    stageStartedAt.set('normalizing', performance.now());
    emitProgress(options.onProgress, 'normalizing', 0, 'Normalizing text...', { format });

    // The text processing engine handles normalization internally,
    // but we do a pre-pass for chapter detection compatibility
    const normalizedText = cleanedText
        .replace(/\r\n|\r/g, '\n')
        .replace(/\t+/g, ' ')
        .replace(/[ ]{3,}/g, '  ')
        .trim();

    emitProgress(options.onProgress, 'normalizing', 100, 'Text normalized.', { format });
    stageDurationMs.normalizing = Math.round(performance.now() - (stageStartedAt.get('normalizing') ?? 0));
    writeCheckpoint({
        key: checkpointKeyForFile(file),
        format,
        rawText,
        normalizedText,
        updatedAt: Date.now(),
    });

    checkAborted(options.signal);

    // ── Stage 5: Detect Chapters ─────────────────────────────
    stageStartedAt.set('detecting_chapters', performance.now());
    emitProgress(options.onProgress, 'detecting_chapters', 0, 'Detecting chapters...', { format });

    let segments: ChapterSegment[];
    let chapterDetectionTier: IngestionResult['chapterDetectionTier'] = 'chapter_regex';
    try {
        segments = segmentChapters(normalizedText);
        if (segments.length === 0) {
            chapterDetectionFailures++;
            segments = detectChaptersByStructuralMarkers(normalizedText);
            chapterDetectionTier = 'scene_split';
        }
        if (segments.length === 0) {
            chapterDetectionFailures++;
            chapterDetectionTier = 'single_chapter_safe_mode';
            segments = [{
                title: 'Full Text',
                content: normalizedText,
                startIndex: 0,
                endIndex: normalizedText.length,
            }];
        }
    } catch (err) {
        chapterDetectionFailures++;
        warnings.push(`Chapter detection failed: ${err instanceof Error ? err.message : String(err)}`);
        const fallbackSegments = detectChaptersByStructuralMarkers(normalizedText);
        if (fallbackSegments.length > 0) {
            chapterDetectionTier = 'scene_split';
            segments = fallbackSegments;
        } else {
            chapterDetectionTier = 'single_chapter_safe_mode';
        segments = [{
            title: 'Full Text',
            content: normalizedText,
            startIndex: 0,
            endIndex: normalizedText.length,
        }];
        }
    }

    validateChapters(segments);

    emitProgress(
        options.onProgress,
        'detecting_chapters',
        100,
        `Detected ${segments.length} chapter${segments.length === 1 ? '' : 's'}.`,
        { format },
    );
    stageDurationMs.detecting_chapters = Math.round(
        performance.now() - (stageStartedAt.get('detecting_chapters') ?? 0),
    );

    checkAborted(options.signal);

    // ── Stage 6: Process Text Through Engine ─────────────────
    stageStartedAt.set('processing_text', performance.now());
    emitProgress(options.onProgress, 'processing_text', 0, 'Processing narrative structure...', { format });

    const textOptions: TextProcessingOptions = {
        skipCleaning: true, // already cleaned above
        detectSpeakers: true,
        ...options.textProcessingOptions,
    };

    // Process each chapter through the text processing engine
    const chapters: IngestedChapter[] = [];
    let totalWords = 0;

    for (let i = 0; i < segments.length; i++) {
        checkAborted(options.signal);

        const segment = segments[i];
        const chapterPercent = Math.round(((i + 1) / segments.length) * 100);

        emitProgress(
            options.onProgress,
            'processing_text',
            chapterPercent,
            `Processing chapter ${i + 1} of ${segments.length}: ${segment.title}...`,
            { format },
        );

        let narrative: NarrativeDocument;
        try {
            narrative = processText(segment.content, textOptions);
        } catch (err) {
            warnings.push(`Chapter "${segment.title}" text processing failed: ${err instanceof Error ? err.message : String(err)}`);
            // Minimal fallback narrative
            narrative = processText(segment.content, { ...textOptions, detectSpeakers: false });
        }

        chapters.push({
            title: segment.title,
            content: segment.content,
            narrative,
            startIndex: segment.startIndex,
            endIndex: segment.endIndex,
        });

        totalWords += narrative.stats.totalWords;
    }

    // Generate full-document narrative for book-level analysis
    const fullNarrative = processText(normalizedText, textOptions);

    // Detect title
    const title = extractTitle(normalizedText);

    emitProgress(options.onProgress, 'complete', 100, 'Document ingestion complete.', { format });
    stageDurationMs.processing_text = Math.round(
        performance.now() - (stageStartedAt.get('processing_text') ?? 0),
    );
    stageDurationMs.complete = 0;

    if (ocrUsed) {
        warnings.push('OCR was used on some pages. Text quality may vary.');
    }
    if (
        ocrPageRatio >= LOW_CONFIDENCE_OCR_RATIO_THRESHOLD ||
        (typeof ocrAverageConfidence === 'number' &&
            ocrAverageConfidence < LOW_CONFIDENCE_OCR_CONFIDENCE_THRESHOLD) ||
        lowConfidenceExtraction
    ) {
        warnings.push(
            'Low-confidence extraction detected. Please verify text quality before chapter-level editing.',
        );
    }
    if (damagedPages > 0) {
        warnings.push(
            `Recovered with ${damagedPages} damaged page${damagedPages === 1 ? '' : 's'}.`,
        );
    }
    if (chapterDetectionTier !== 'chapter_regex') {
        warnings.push(`Chapter detection fallback tier used: ${chapterDetectionTier}.`);
    }

    clearCheckpoint(file);

    const totalDurationMs = Math.round(performance.now() - startTime);

    return {
        format,
        title: title !== 'Untitled Novel' ? title : file.name.replace(/\.[^.]+$/, '').trim() || 'Untitled Novel',
        totalWords,
        chapters,
        cleanedText: normalizedText,
        fullNarrative,
        processingTimeMs: totalDurationMs,
        ocrUsed,
        ocrQuality: {
            ocrPageRatio,
            ocrAverageConfidence,
            lowConfidenceExtraction,
        },
        chapterDetectionTier,
        telemetry: {
            stageDurationMs,
            totalDurationMs,
            ocrUsageRate: ocrPageRatio,
            chapterDetectionFailures,
            userAborted: false,
        },
        warnings,
    };
}

/**
 * Quick validation check — does this file look ingestable?
 * Returns null if valid, or an error message if not.
 */
export function validateForIngestion(file: File): string | null {
    try {
        validateFile(file);
        return null;
    } catch (err) {
        if (err instanceof IngestionError) return err.userMessage;
        return err instanceof Error ? err.message : 'Unknown validation error';
    }
}

/**
 * Get supported format info for UI display.
 */
export function getSupportedFormats(): Array<{ extension: string; label: string; mime: string }> {
    return [
        { extension: '.pdf', label: 'PDF', mime: 'application/pdf' },
        { extension: '.docx', label: 'Word Document', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        { extension: '.epub', label: 'EPUB', mime: 'application/epub+zip' },
        { extension: '.pptx', label: 'PowerPoint', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
        { extension: '.txt', label: 'Plain Text', mime: 'text/plain' },
    ];
}
