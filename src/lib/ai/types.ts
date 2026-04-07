/**
 * ai/types.ts — AI Engine Type Definitions
 *
 * Shared interfaces and types used across the AI engine modules.
 */

import type { AIConnectionStatus } from '../../types/cinematifier';

// Re-export for convenience
export type { AIConnectionStatus };

// ─── PUBLIC CONFIG TYPE ────────────────────────────────────────────────────────

export type AIProvider =
    | 'none'
    | 'chrome'
    | 'gemini'
    | 'ollama'
    | 'openai'
    | 'anthropic'
    | 'groq'
    | 'deepseek';

export interface AIConfig {
    provider: AIProvider;
    /** Optional model override. When omitted, provider defaults from MODEL_PRESETS are used. */
    model?: string;
    /** Optional universal API key that can be reused across provider selections. */
    universalApiKey?: string;
    geminiKey: string;
    useSearchGrounding: boolean;
    openAiKey: string;
    anthropicKey: string;
    groqKey: string;
    deepseekKey: string;
    ollamaUrl: string;
    ollamaModel: string;
    /** When true, skip JSON response formatting and use higher token limits (for cinematification) */
    rawTextMode?: boolean;
    /** Custom system prompt to replace the default JSON-oriented one */
    systemPrompt?: string;
}

// ─── MODEL PRESETS ─────────────────────────────────────────────────────────────

export interface ModelPreset {
    model: string;
    contextWindow: number;
    maxTokens: number;
    temperature: number;
    supportsJSON: boolean;
    supportsStreaming: boolean;
    rateLimitRPM: number;
    rateLimitTPM: number;
}

// ─── ERROR TYPES ───────────────────────────────────────────────────────────────

export type AIErrorType =
    | 'rate_limit'
    | 'auth'
    | 'network'
    | 'timeout'
    | 'invalid_response'
    | 'model_unavailable'
    | 'unknown';

// ─── CHROME AI TYPE AUGMENTATION ───────────────────────────────────────────────

declare global {
    interface Window {
        ai?: {
            languageModel: {
                capabilities: () => Promise<{ available: 'readily' | 'after-download' | 'no' }>;
                create: (options?: Record<string, unknown>) => Promise<{
                    prompt: (text: string) => Promise<string>;
                    promptStreaming: (text: string) => AsyncIterable<string>;
                    destroy: () => void;
                }>;
            };
        };
    }
}
