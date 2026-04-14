/**
 * ai/types.ts — AI Engine Type Definitions
 *
 * Shared interfaces and types used across the AI engine modules.
 * Defines the core AIProviderInstance interface that all providers implement.
 */

import type { AIConnectionStatus } from '../../types/cinematifier';

// Re-export for convenience
export type { AIConnectionStatus };

// ─── PROVIDER NAME UNION ───────────────────────────────────────────────────────

export type AIProviderName =
    | 'none'
    | 'chrome'
    | 'gemini'
    | 'ollama'
    | 'openai'
    | 'anthropic'
    | 'groq'
    | 'deepseek'
    | 'nvidia-nim'
    | 'gemma'
    | 'gwen';

/** @deprecated Use AIProviderName — kept as alias for backward compatibility. */
export type AIProvider = AIProviderName;

export type AIFallbackProvider = 'openai' | 'gemini' | 'claude';

// ─── AI RESPONSE ───────────────────────────────────────────────────────────────

export interface AIResponse {
    text: string;
    model: string;
    provider: AIProviderName;
    tokenUsage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

// ─── GENERATE OPTIONS ──────────────────────────────────────────────────────────

export interface GenerateOptions {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    systemPrompt?: string;
    useJSON?: boolean;
    rawTextMode?: boolean;
    timeoutMs?: number;
    signal?: AbortSignal;
}

// ─── AI PROVIDER INSTANCE INTERFACE ────────────────────────────────────────────

/**
 * Core provider contract. Every AI provider must implement generate(), stream(),
 * and healthCheck(). Provider logic is isolated — no cross-provider coupling.
 */
export interface AIProviderInstance {
    /** Provider identifier matching the AIProviderName union. */
    readonly name: AIProviderName;
    /** Approximate cost per 1K tokens (USD). Used for routing decisions. */
    readonly costPer1KTokens?: number;
    /** Whether this provider supports streaming responses. */
    readonly supportsStreaming: boolean;

    /** Generate a complete response synchronously. */
    generate(prompt: string, config: AIConfig, options?: GenerateOptions): Promise<AIResponse>;

    /** Stream response chunks as they arrive. */
    stream(prompt: string, config: AIConfig, options?: GenerateOptions): AsyncGenerator<string>;

    /** Verify provider connectivity. Returns true if reachable. */
    healthCheck(config: AIConfig): Promise<boolean>;
}

// ─── PUBLIC CONFIG TYPE ────────────────────────────────────────────────────────

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
    /** NVIDIA NIM API key */
    nvidiaNimKey?: string;
    /** Gwen custom adapter endpoint URL */
    gwenUrl?: string;
    /** Gwen custom adapter API key */
    gwenKey?: string;
    /** Optional fallback order for multi-provider routing in AIManager. */
    fallbackProviders?: AIFallbackProvider[];
    /** Prefer lower-cost fallback providers when multiple providers are available. */
    preferLowerCost?: boolean;
    /** Optional per-request cost budget (USD) used by AIManager guardrails. */
    maxCostUsd?: number;
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
