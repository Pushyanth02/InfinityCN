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
        maxTokens: 8192,
        temperature: 0.4,
        supportsJSON: true,
        supportsStreaming: true,
        rateLimitRPM: 15,
    },
    openai: {
        model: 'gpt-4o-mini',
        maxTokens: 4096,
        temperature: 0.4,
        supportsJSON: true,
        supportsStreaming: true,
        rateLimitRPM: 60,
    },
    anthropic: {
        model: 'claude-3-5-sonnet-latest',
        maxTokens: 4096,
        temperature: 0.4,
        supportsJSON: false,
        supportsStreaming: true,
        rateLimitRPM: 60,
    },
    groq: {
        model: 'llama-3.3-70b-versatile',
        maxTokens: 4096,
        temperature: 0.4,
        supportsJSON: true,
        supportsStreaming: true,
        rateLimitRPM: 30,
    },
    deepseek: {
        model: 'deepseek-chat',
        maxTokens: 4096,
        temperature: 0.4,
        supportsJSON: true,
        supportsStreaming: true,
        rateLimitRPM: 60,
    },
    ollama: {
        model: 'llama3',
        maxTokens: 4096,
        temperature: 0.4,
        supportsJSON: true,
        supportsStreaming: true,
        rateLimitRPM: 120,
    },
};
