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
        maxTokens: 2048,
        temperature: 0.4,
        supportsJSON: false,
        supportsStreaming: true,
        rateLimitRPM: 60,
    },
    gemini: {
        model: 'gemini-2.5-flash',
        maxTokens: 4096,
        temperature: 0.3,
        supportsJSON: true,
        supportsStreaming: true,
        rateLimitRPM: 60,
    },
    openai: {
        model: 'gpt-4o-mini',
        maxTokens: 4096,
        temperature: 0.3,
        supportsJSON: true,
        supportsStreaming: true,
        rateLimitRPM: 60,
    },
    anthropic: {
        model: 'claude-sonnet-4-20250514',
        maxTokens: 4096,
        temperature: 0.3,
        supportsJSON: false,
        supportsStreaming: true,
        rateLimitRPM: 40,
    },
    groq: {
        model: 'llama-3.3-70b-versatile',
        maxTokens: 4096,
        temperature: 0.3,
        supportsJSON: true,
        supportsStreaming: true,
        rateLimitRPM: 30,
    },
    deepseek: {
        model: 'deepseek-chat',
        maxTokens: 4096,
        temperature: 0.3,
        supportsJSON: true,
        supportsStreaming: true,
        rateLimitRPM: 30,
    },
    ollama: {
        model: 'llama3',
        maxTokens: 4096,
        temperature: 0.3,
        supportsJSON: true,
        supportsStreaming: true,
        rateLimitRPM: 120,
    },
};
