/**
 * types.ts — Shared server-side type definitions
 */

// ─── Job Status ──────────────────────────────────────────────

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface JobState {
    bookId: string;
    title: string;
    status: JobStatus;
    provider: string;
    totalChapters: number;
    processedChapters: number;
    currentChapter: number;
    errorMessage: string;
    createdAt: number;
    updatedAt: number;
}

// ─── RabbitMQ Messages ───────────────────────────────────────

export interface CinematifyJobMessage {
    bookId: string;
    chapterIndex: number;
    chapterTitle: string;
    originalText: string;
    provider: string;
    totalChapters: number;
    attempt: number;
    maxAttempts: number;
    correlationId: string;
}

export interface PdfExtractJobMessage {
    bookId: string;
    fileUrl: string;
    correlationId: string;
}

// ─── SSE Events ──────────────────────────────────────────────

export type JobEventType =
    | 'status'
    | 'chapter_started'
    | 'chapter_completed'
    | 'job_completed'
    | 'job_failed'
    | 'job_cancelled';

export interface JobEvent {
    type: JobEventType;
    bookId: string;
    chapterIndex?: number;
    totalChapters?: number;
    processedChapters?: number;
    errorMessage?: string;
    timestamp: number;
}

// ─── AI Provider Config ──────────────────────────────────────

export interface ServerAIConfig {
    geminiKey: string;
    openaiKey: string;
    anthropicKey: string;
    groqKey: string;
    deepseekKey: string;
    ollamaUrl: string;
}

// ─── Chapter Result ──────────────────────────────────────────

export interface CinematicBlock {
    id: string;
    type: string;
    content: string;
    speaker?: string;
    sfx?: { sound: string; intensity: string; duration?: string };
    beat?: { type: string; duration?: number; description?: string };
    transition?: { type: string; description?: string; toLocation?: string };
    intensity: string;
    cameraDirection?: string;
    timing?: string;
    emotion?: string;
    tensionScore?: number;
}

export interface ChapterResult {
    blocks: CinematicBlock[];
    rawText: string;
    metadata: {
        originalWordCount: number;
        cinematifiedWordCount: number;
        sfxCount: number;
        transitionCount: number;
        beatCount: number;
        processingTimeMs: number;
    };
}

// ─── API Request/Response ────────────────────────────────────

export interface SubmitJobRequest {
    bookId?: string;
    title: string;
    chapters: Array<{
        title: string;
        originalText: string;
    }>;
    provider: string;
}

export interface SubmitJobResponse {
    bookId: string;
    status: JobStatus;
    totalChapters: number;
}

// ─── Provider Config ─────────────────────────────────────────

export interface ProviderConfig {
    url: string | (() => string);
    keyEnv: string;
    authHeader: (key: string) => Record<string, string>;
}
