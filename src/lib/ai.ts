/**
 * ai.ts — AI Engine (Re-export Facade)
 *
 * This file re-exports all public APIs from the modular AI engine.
 * The implementation has been decomposed into focused sub-modules under
 * src/lib/ai/ for better separation of concerns:
 *
 *   - ai/types.ts      — AIConfig, ModelPreset, AIErrorType interfaces
 *   - ai/presets.ts     — MODEL_PRESETS configuration
 *   - ai/cache.ts       — LRU response cache
 *   - ai/errors.ts      — AIError class, classifyError, withRetry
 *   - ai/providers.ts   — callAI base router, proxy support, HTTP error handling
 *   - ai/streaming.ts   — streamAI async generator, SSE parsing
 *   - ai/index.ts       — Barrel re-export with callAIWithDedup, testConnection, parseJSON
 *
 * Existing consumers can continue importing from this file without changes.
 */

export { callAIWithDedup, streamAI, parseJSON, testConnection, MODEL_PRESETS } from './ai/index';

export type { AIConfig, ModelPreset, AIErrorType } from './ai/index';
