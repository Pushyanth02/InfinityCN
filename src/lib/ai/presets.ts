/**
 * ai/presets.ts — Model Presets Configuration
 *
 * Centralised provider model configurations: model names, token limits,
 * temperature, JSON/streaming support, and rate limits.
 */

import type { ModelPreset } from './types';

export const MODEL_PRESETS: Record<string, ModelPreset> = {
    chrome: {
        model: 'gemini-nano',
        contextWindow: 4096,
        maxTokens: 2048,
        temperature: 0.4,
        supportsJSON: false,
        supportsStreaming: true,
        rateLimitRPM: 60,
        rateLimitTPM: 120000,
    },
    gemini: {
        model: 'gemini-2.5-flash',
        contextWindow: 1_000_000,
        maxTokens: 8192,
        temperature: 0.4,
        supportsJSON: true,
        supportsStreaming: true,
        rateLimitRPM: 15,
        rateLimitTPM: 250000,
    },
    openai: {
        model: 'gpt-4o-mini',
        contextWindow: 128000,
        maxTokens: 4096,
        temperature: 0.4,
        supportsJSON: true,
        supportsStreaming: true,
        rateLimitRPM: 60,
        rateLimitTPM: 300000,
    },
    anthropic: {
        model: 'claude-3-5-sonnet-latest',
        contextWindow: 200000,
        maxTokens: 4096,
        temperature: 0.4,
        supportsJSON: false,
        supportsStreaming: true,
        rateLimitRPM: 60,
        rateLimitTPM: 240000,
    },
    groq: {
        model: 'llama-3.3-70b-versatile',
        contextWindow: 128000,
        maxTokens: 4096,
        temperature: 0.4,
        supportsJSON: true,
        supportsStreaming: true,
        rateLimitRPM: 30,
        rateLimitTPM: 300000,
    },
    deepseek: {
        model: 'deepseek-chat',
        contextWindow: 64000,
        maxTokens: 4096,
        temperature: 0.4,
        supportsJSON: true,
        supportsStreaming: true,
        rateLimitRPM: 60,
        rateLimitTPM: 240000,
    },
    ollama: {
        model: 'llama3',
        contextWindow: 32768,
        maxTokens: 4096,
        temperature: 0.4,
        supportsJSON: true,
        supportsStreaming: true,
        rateLimitRPM: 120,
        rateLimitTPM: 120000,
    },
};
