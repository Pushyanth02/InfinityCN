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


// ─── App State ────────────────────────────────────────────

export interface AppState {
    isProcessing: boolean;
    progress: number;
    rawText: string;
    panels: MangaPanel[];
    characters: Character[];
    recap: string | null;
    atmosphere: Atmosphere | null;
    // Removed analytics
    error: string | null;
    currentChapterId: number | null;
    chapterTitle: string | null;

    // AI Settings
    aiProvider: 'none' | 'chrome' | 'gemini' | 'ollama' | 'openai' | 'anthropic' | 'groq' | 'deepseek';
    geminiKey: string;
    useSearchGrounding: boolean;
    openAiKey: string;
    anthropicKey: string;
    groqKey: string;
    deepseekKey: string;
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
    setCurrentChapterId: (id: number | null) => void;
    setMangaData: (data: Partial<Pick<AppState, Extract<keyof AppState, 'panels' | 'characters' | 'recap' | 'atmosphere' | 'chapterTitle'>>>) => void;
    setAiConfig: (config: Partial<Pick<AppState, 'aiProvider' | 'geminiKey' | 'useSearchGrounding' | 'openAiKey' | 'anthropicKey' | 'groqKey' | 'deepseekKey' | 'ollamaUrl' | 'ollamaModel'>>) => void;
    resetReader: () => void;
}
