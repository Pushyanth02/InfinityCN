/**
 * providers/index.ts — Provider Registry & Factory
 *
 * Central registry for all AI provider implementations. Providers are
 * lazily instantiated on first access. New providers auto-register here.
 */

import type { AIProviderName, AIProviderInstance } from '../types';

// ─── PROVIDER IMPORTS ─────────────────────────────────────────────────────────

import { OpenAIProvider, GroqProvider, DeepSeekProvider } from './openai';
import { GeminiProvider } from './gemini';
import { AnthropicProvider } from './anthropic';
import { OllamaProvider } from './ollama';
import { ChromeProvider } from './chrome';
import { NvidiaNimProvider } from './nvidia-nim';
import { GemmaProvider } from './gemma';
import { GwenProvider } from './gwen';

// ─── REGISTRY ─────────────────────────────────────────────────────────────────

type ProviderFactory = () => AIProviderInstance;

const PROVIDER_FACTORIES = new Map<AIProviderName, ProviderFactory>([
    ['openai', () => new OpenAIProvider()],
    ['gemini', () => new GeminiProvider()],
    ['anthropic', () => new AnthropicProvider()],
    ['ollama', () => new OllamaProvider()],
    ['chrome', () => new ChromeProvider()],
    ['groq', () => new GroqProvider()],
    ['deepseek', () => new DeepSeekProvider()],
    ['nvidia-nim', () => new NvidiaNimProvider()],
    ['gemma', () => new GemmaProvider()],
    ['gwen', () => new GwenProvider()],
]);

/** Singleton cache — providers are instantiated once and reused. */
const providerInstances = new Map<AIProviderName, AIProviderInstance>();

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Get a provider instance by name. Lazily instantiated, then cached.
 * Throws if the provider name is unknown.
 */
export function getProvider(name: AIProviderName): AIProviderInstance {
    if (name === 'none') {
        throw new Error('AI provider is not configured. Open AI Settings to choose a provider.');
    }

    const cached = providerInstances.get(name);
    if (cached) return cached;

    const factory = PROVIDER_FACTORIES.get(name);
    if (!factory) {
        throw new Error(`Unknown AI provider: "${name}". Available: ${listProviders().join(', ')}`);
    }

    const instance = factory();
    providerInstances.set(name, instance);
    return instance;
}

/**
 * Register a custom provider at runtime.
 * Overwrites any existing provider with the same name.
 */
export function registerProvider(name: AIProviderName, factory: ProviderFactory): void {
    PROVIDER_FACTORIES.set(name, factory);
    providerInstances.delete(name); // Clear cached instance so factory runs on next access
}

/** List all registered provider names (excludes 'none'). */
export function listProviders(): AIProviderName[] {
    return [...PROVIDER_FACTORIES.keys()];
}

/** Check if a provider is registered. */
export function hasProvider(name: AIProviderName): boolean {
    return name !== 'none' && PROVIDER_FACTORIES.has(name);
}

// ─── RE-EXPORTS ───────────────────────────────────────────────────────────────

export { BaseAIProvider, API_PROXY_URL, DEFAULT_SYSTEM_PROMPT } from './base';
export { OpenAICompatibleProvider, OPENAI_ENDPOINTS } from './openai';
export type { OpenAICompatibleEndpoint } from './openai';
export { OpenAIProvider, GroqProvider, DeepSeekProvider } from './openai';
export { GeminiProvider } from './gemini';
export { AnthropicProvider } from './anthropic';
export { OllamaProvider } from './ollama';
export { ChromeProvider } from './chrome';
export { NvidiaNimProvider } from './nvidia-nim';
export { GemmaProvider } from './gemma';
export { GwenProvider } from './gwen';
