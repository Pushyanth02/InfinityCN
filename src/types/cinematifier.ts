/**
 * cinematifier.ts — Cinematifier Type Definitions
 *
 * Types for the PDF-to-Cinematic text transformation system.
 * Includes scenes, beats, SFX annotations, and transitions.
 * Entity models for Book, Chapter, and ReadingProgress.
 */

// ─── Database Entity Enums ─────────────────────────────────────────────────────

export type BookGenre =
    | 'fantasy'
    | 'romance'
    | 'thriller'
    | 'sci_fi'
    | 'mystery'
    | 'historical'
    | 'literary_fiction'
    | 'horror'
    | 'adventure'
    | 'other';

export type BookStatus = 'uploading' | 'processing' | 'ready' | 'error';

export type ChapterStatus = 'pending' | 'processing' | 'ready' | 'error';

// ─── Narrative Metadata ────────────────────────────────────────────────────────

export type EmotionCategory =
    | 'joy'
    | 'fear'
    | 'sadness'
    | 'suspense'
    | 'anger'
    | 'surprise'
    | 'neutral';

export interface CharacterAppearance {
    appearances: number[]; // Block/Paragraph indices
    dialogueCount: number;
}

// ─── Core Cinematic Elements ───────────────────────────────────────────────────

export type TransitionType =
    | 'FADE IN'
    | 'FADE OUT'
    | 'CUT TO'
    | 'DISSOLVE TO'
    | 'SMASH CUT'
    | 'MATCH CUT'
    | 'JUMP CUT'
    | 'WIPE TO'
    | 'IRIS IN'
    | 'IRIS OUT';

export type BeatType = 'BEAT' | 'PAUSE' | 'LONG PAUSE' | 'SILENCE' | 'TENSION' | 'RELEASE';

export type SFXIntensity = 'soft' | 'medium' | 'loud' | 'explosive';

export interface SFXAnnotation {
    sound: string; // e.g., "BOOM", "CRASH", "WHISPER"
    intensity: SFXIntensity;
    duration?: 'brief' | 'sustained' | 'lingering';
}

export interface CinematicBeat {
    type: BeatType;
    duration?: number; // in seconds, for pacing
    description?: string;
}

export interface SceneTransition {
    type: TransitionType;
    description?: string;
    toLocation?: string;
}

// ─── Cinematic Text Block ──────────────────────────────────────────────────────

export type CinematicBlockType =
    | 'action' // Descriptive action/scene setting
    | 'dialogue' // Character dialogue
    | 'inner_thought' // Character internal monologue
    | 'sfx' // Sound effect annotation
    | 'beat' // Dramatic pause/beat
    | 'transition' // Scene transition
    | 'title_card' // Chapter/scene title
    | 'flashback_start'
    | 'flashback_end'
    | 'montage_start'
    | 'montage_end';

export interface CinematicBlock {
    id: string;
    type: CinematicBlockType;
    content: string;
    speaker?: string;
    sfx?: SFXAnnotation;
    beat?: CinematicBeat;
    transition?: SceneTransition;
    intensity: 'whisper' | 'normal' | 'emphasis' | 'shout' | 'explosive';
    cameraDirection?: string; // e.g., "CLOSE ON", "WIDE SHOT", "POV"
    timing?: 'slow' | 'normal' | 'quick' | 'rapid';
    emotion?: EmotionCategory;
    tensionScore?: number; // 0-100
}

// ─── Chapter Entity ────────────────────────────────────────────────────────────

export interface Chapter {
    id: string;
    bookId: string; // Foreign key to Book
    number: number; // Sequential: 1, 2, 3...
    title: string; // "Chapter 1", "The Awakening", etc.
    originalText: string; // 2,000-5,000 words typical
    cinematifiedText?: string; // AI-enhanced version (serialized blocks)
    cinematifiedBlocks: CinematicBlock[];
    status: ChapterStatus;
    wordCount: number;
    isProcessed: boolean; // Legacy compat
    estimatedReadTime: number; // in minutes
    errorMessage?: string; // If processing failed
    toneTags?: string[];
    characters?: Record<string, CharacterAppearance>;
}

// ─── Book Entity ───────────────────────────────────────────────────────────────

export interface Book {
    id: string;
    title: string;
    author?: string;
    description?: string; // Synopsis
    fileUrl?: string; // Uploaded PDF URL (for cloud storage)
    genre: BookGenre;
    status: BookStatus;
    totalChapters: number;
    processedChapters: number; // Progress tracking
    isPublic: boolean; // Library visibility
    errorMessage?: string; // If processing failed
    chapters: Chapter[];
    totalWordCount: number;
    createdAt: number;
    updatedAt?: number;
    characters?: Record<string, CharacterAppearance>;
}

// ─── ReadingProgress Entity ────────────────────────────────────────────────────

export interface ReadingProgress {
    id: string;
    bookId: string; // Foreign key to Book
    currentChapter: number; // Chapter number (1-based)
    scrollPosition: number; // Scroll position in current chapter
    readingMode: ReaderMode; // User preference
    bookmarks: number[]; // Chapter numbers that are bookmarked
    completed: boolean; // Has finished the book
    lastReadAt: number; // Timestamp
    readChapters: number[]; // List of completed chapter numbers
    totalReadTime: number; // Cumulative reading time in seconds
}

// ─── Reader State ──────────────────────────────────────────────────────────────

export type ReaderMode = 'original' | 'cinematified' | 'side-by-side';

export type ImmersionLevel = 'minimal' | 'balanced' | 'cinematic';

export interface ReaderState {
    mode: ReaderMode;
    currentChapterIndex: number;
    scrollPosition: number;
    fontSize: number;
    lineSpacing: number; // Line height multiplier (1.4 - 2.4)
    immersionLevel: ImmersionLevel;
    dyslexiaFont: boolean;
    autoScrollSpeed: number; // 0 = off, 1-10 = speed levels
}

// ─── Processing State ──────────────────────────────────────────────────────────

export interface ProcessingProgress {
    phase: 'extracting' | 'segmenting' | 'cinematifying' | 'complete' | 'error';
    currentChapter: number;
    totalChapters: number;
    percentComplete: number;
    message: string;
}

// ─── LLM Response Types ────────────────────────────────────────────────────────

export interface CinematificationResult {
    blocks: CinematicBlock[];
    rawText?: string; // Full cinematified text from AI (before block parsing)
    metadata: {
        originalWordCount: number;
        cinematifiedWordCount: number;
        sfxCount: number;
        transitionCount: number;
        beatCount: number;
        processingTimeMs: number;
    };
}

export interface ChapterSegment {
    title: string;
    content: string;
    startIndex: number;
    endIndex: number;
}

// ─── AI Connection Status ─────────────────────────────────────────────────────

/** AI connection test result */
export interface AIConnectionStatus {
    ok: boolean;
    provider: string;
    message: string;
    latencyMs?: number;
}
