// SavedChapter is defined and exported from '../lib/db'

export interface MangaPanel {
    id: string;
    type: 'narration' | 'dialogue' | 'scene_transition' | 'sound_effect';
    content: string;
    speaker?: string;
    intensity?: 'low' | 'normal' | 'high';
    alignment?: 'left' | 'center' | 'right';
    tension: number;
    sentiment: number;
    isSceneBoundary?: boolean;
}

export interface Character {
    name: string;
    description: string;
    frequency?: number;
    sentiment?: number;
    honorific?: string;
}

export interface Atmosphere {
    mood: 'dark_stormy' | 'bright_sunny' | 'mysterious_fog' | 'tense_battle' | 'quiet_indoor' | 'default';
    description: string;
}

// ─── Analytics ────────────────────────────────────────────

export interface ReadabilityMetrics {
    fleschEase: number;
    gradeLevel: number;
    label: string;
    wordCount: number;
    sentenceCount: number;
    avgWordsPerSentence: number;
    avgSyllablesPerWord: number;
}

export interface VocabularyMetrics {
    ttr: number;
    mattr: number;
    uniqueWords: number;
    totalWords: number;
    richness: 'Very High' | 'High' | 'Moderate' | 'Low' | 'Very Low';
}

export interface PacingMetrics {
    label: 'breakneck' | 'brisk' | 'measured' | 'contemplative' | 'languid';
    dialogueRatio: number;
    narrationRatio: number;
    avgTension: number;
    peakTensionIndex: number;
    dominantSentiment: 'positive' | 'negative' | 'neutral';
    emotionalSwings: number;
}

// ─── AI Enriched Types ─────────────────────────────────────

/** Result of AI genre & style analysis */
export interface StyleAnalysis {
    genre: string;
    narrativeVoice: string;
    pacingStyle: string;
    iconicQuote: string;
    themes: string[];
}

/** A single thematic insight bullet point */
export interface ChapterInsight {
    text: string;
}

/** AI connection test result */
export interface AIConnectionStatus {
    ok: boolean;
    provider: string;
    message: string;
    latencyMs?: number;
}

export interface ChapterAnalytics {
    readability: ReadabilityMetrics;
    vocabulary: VocabularyMetrics;
    pacing: PacingMetrics;
    estimatedReadingTime: number;
    overallSentiment: 'positive' | 'negative' | 'neutral';
    sentimentScore: number;
    emotionalArc: number[];
    sceneBoundaryCount: number;
    textRankSummary: string;
    // V16: New algorithmic metrics
    hapaxRatio?: { ratio: number; count: number; label: string };
    sentenceComplexity?: { avg: number; max: number; label: string };
    paragraphRhythm?: { score: number; avgVariance: number; label: string };
    // AI-enriched (optional — only present when AI is enabled)
    style?: StyleAnalysis;
    insights?: ChapterInsight[];
    aiMoodDescription?: string;
}

// ─── App State ────────────────────────────────────────────

export interface AppState {
    isProcessing: boolean;
    progress: number;
    rawText: string;
    panels: MangaPanel[];
    characters: Character[];
    recap: string | null;
    atmosphere: Atmosphere | null;
    analytics: ChapterAnalytics | null;
    error: string | null;
    currentChapterId: number | null;

    // AI Settings
    aiProvider: 'none' | 'chrome' | 'gemini' | 'ollama';
    geminiKey: string;
    ollamaUrl: string;
    ollamaModel: string;

    // V16: Progress phase
    progressLabel: string;

    // Actions
    setProgress: (progress: number) => void;
    setProgressLabel: (label: string) => void;
    setError: (error: string | null) => void;
    setErrorAndStop: (error: string | null) => void;
    setProcessing: (isProcessing: boolean) => void;
    setRawText: (text: string) => void;
    setMangaData: (data: Partial<Pick<AppState, 'panels' | 'characters' | 'recap' | 'atmosphere' | 'analytics'>>) => void;
    setCurrentChapterId: (id: number | null) => void;
    setAiConfig: (config: Partial<Pick<AppState, 'aiProvider' | 'geminiKey' | 'ollamaUrl' | 'ollamaModel'>>) => void;
    resetReader: () => void;
}
