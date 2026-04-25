/**
 * ai/taskRouter.ts — Task-Based AI Routing
 *
 * Maps InfinityCN pipeline task types to routing policies, system prompts,
 * and configuration overrides. Single source of truth for "what provider
 * and settings should handle this specific task?"
 *
 * Architecture:
 *   AITaskType → TaskProfile → { RequestPolicy, systemPrompt, temperature }
 *                           → AIProviderRouter.route(policy)
 *                           → RoutingDecision
 *
 * Usage:
 *   const task = getTaskProfile('cinematization');
 *   const decision = routeTask('cinematization', prompt);
 *   const result = await callByTask('scene-analysis', prompt, config);
 */

import type { AIConfig } from './types';
import type { RequestPolicy, RoutingDecision } from './router';
import { chooseProvider, hashPromptForRouting, ROUTING_POLICIES } from './router';
import { getDefaultPipeline, createCacheKey } from './requestPipeline';
import { callAI, prepareAICall } from './providers';
import { getRateLimiter } from './rateLimiterRegistry';

// ─── TASK TYPES ───────────────────────────────────────────────────────────────

/**
 * All recognised InfinityCN pipeline task types.
 *
 * Each maps to a specific routing profile with cost/quality tradeoffs
 * tailored to the task's requirements.
 */
export type AITaskType =
    | 'formatting'          // Text cleanup, paragraph reconstruction — cheap, fast
    | 'scene-analysis'      // Scene segmentation, emotion mapping — medium cost
    | 'cinematization'      // Full cinematic transformation — high cost, streaming
    | 'metadata'            // Title/author extraction — cheapest
    | 'narrative-analysis'  // POV, flashback, tension arc — critical tier
    | 'text-repair'         // OCR cleanup, encoding fixes — cheapest
    | 'chapter-summary'     // Chapter summarisation — medium cost
    | 'character-tracking'; // Character state extraction — medium cost

// ─── TASK PROFILES ────────────────────────────────────────────────────────────

export interface TaskProfile {
    /** The task type identifier. */
    type: AITaskType;
    /** Display name for logging/diagnostics. */
    displayName: string;
    /** Routing policy that drives provider selection. */
    policy: RequestPolicy;
    /** System prompt tailored to this task. */
    systemPrompt: string;
    /** Temperature override (uses policy default if undefined). */
    temperature?: number;
    /** Whether this task benefits from streaming output. */
    useStreaming: boolean;
    /** Whether the output must be valid JSON. */
    requireJSON: boolean;
    /** Whether to use raw text mode (longer timeouts, no JSON enforcement). */
    rawTextMode: boolean;
}

/**
 * Central registry of all task profiles.
 *
 * Each profile bundles the routing policy (from router.ts ROUTING_POLICIES),
 * a task-specific system prompt, and generation parameters.
 */
const TASK_PROFILES: Record<AITaskType, TaskProfile> = {
    'text-repair': {
        type: 'text-repair',
        displayName: 'Text Repair',
        policy: ROUTING_POLICIES.textRepair,
        systemPrompt:
            'You are a text repair engine. Fix encoding errors, OCR artifacts, and formatting issues. ' +
            'Preserve the original meaning exactly. Output the cleaned text only — no explanations.',
        temperature: 0.1,
        useStreaming: false,
        requireJSON: false,
        rawTextMode: true,
    },

    metadata: {
        type: 'metadata',
        displayName: 'Metadata Extraction',
        policy: ROUTING_POLICIES.metadataExtraction,
        systemPrompt:
            'You are a precise literary metadata extractor. Extract title, author, language, and genre ' +
            'from the provided text. Output strictly valid JSON only — no markdown, no explanation.',
        temperature: 0.1,
        useStreaming: false,
        requireJSON: true,
        rawTextMode: false,
    },

    formatting: {
        type: 'formatting',
        displayName: 'Text Formatting',
        policy: {
            complexity: 'low',
            needsStreaming: false,
            maxCost: 0.001,
            preferFastest: true,
            requireStructuredJSON: false,
        },
        systemPrompt:
            'You are a text formatting engine. Reconstruct paragraphs, fix line breaks, and normalise ' +
            'whitespace. Preserve the original text content exactly. Output the formatted text only.',
        temperature: 0.2,
        useStreaming: false,
        requireJSON: false,
        rawTextMode: true,
    },

    'scene-analysis': {
        type: 'scene-analysis',
        displayName: 'Scene Analysis',
        policy: {
            complexity: 'medium',
            needsStreaming: false,
            maxCost: 0.01,
            preferFastest: false,
            requireStructuredJSON: true,
        },
        systemPrompt:
            'You are a literary scene analyst. Identify scene boundaries, emotional tone, tension level, ' +
            'pacing, and point-of-view shifts. Output strictly valid JSON with the structure: ' +
            '{ "scenes": [{ "startLine": number, "endLine": number, "emotion": string, "tension": number, ' +
            '"pacing": string, "pov": string }] }',
        temperature: 0.3,
        useStreaming: false,
        requireJSON: true,
        rawTextMode: false,
    },

    'chapter-summary': {
        type: 'chapter-summary',
        displayName: 'Chapter Summary',
        policy: ROUTING_POLICIES.chapterSummary,
        systemPrompt:
            'You are a precise literary summariser. Produce a concise, spoiler-aware summary of the chapter. ' +
            'Output strictly valid JSON: { "summary": string, "keyEvents": string[], "characters": string[] }',
        temperature: 0.3,
        useStreaming: false,
        requireJSON: true,
        rawTextMode: false,
    },

    'character-tracking': {
        type: 'character-tracking',
        displayName: 'Character Tracking',
        policy: {
            complexity: 'medium',
            needsStreaming: false,
            maxCost: 0.01,
            preferFastest: false,
            requireStructuredJSON: true,
        },
        systemPrompt:
            'You are a character analyst. Extract all named characters, their roles, relationships, ' +
            'and emotional states from the text. Output strictly valid JSON: ' +
            '{ "characters": [{ "name": string, "role": string, "emotionalState": string, "relationships": string[] }] }',
        temperature: 0.2,
        useStreaming: false,
        requireJSON: true,
        rawTextMode: false,
    },

    cinematization: {
        type: 'cinematization',
        displayName: 'Cinematization',
        policy: ROUTING_POLICIES.cinematification,
        systemPrompt:
            'You are a cinematic storytelling engine. Transform the provided text into a vivid, ' +
            'immersive cinematic experience. Enhance pacing, atmosphere, and sensory detail while ' +
            'preserving the original narrative meaning. Do not add plot elements. Output the ' +
            'cinematified text only.',
        temperature: 0.6,
        useStreaming: true,
        requireJSON: false,
        rawTextMode: true,
    },

    'narrative-analysis': {
        type: 'narrative-analysis',
        displayName: 'Narrative Analysis',
        policy: ROUTING_POLICIES.narrativeAnalysis,
        systemPrompt:
            'You are an expert narrative analyst. Perform deep structural analysis: identify point-of-view, ' +
            'flashback sequences, foreshadowing, tension arcs, narrative voice, and thematic motifs. ' +
            'This is critical-tier analysis — use maximum reasoning depth. Output strictly valid JSON.',
        temperature: 0.4,
        useStreaming: true,
        requireJSON: false,
        rawTextMode: true,
    },
};

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Get the full task profile for a given task type.
 */
export function getTaskProfile(task: AITaskType): TaskProfile {
    const profile = TASK_PROFILES[task];
    if (!profile) {
        throw new Error(
            `Unknown AI task type: "${task}". Available: ${listTaskTypes().join(', ')}`,
        );
    }
    return profile;
}

/**
 * List all registered task types.
 */
export function listTaskTypes(): AITaskType[] {
    return Object.keys(TASK_PROFILES) as AITaskType[];
}

/**
 * Route a task to the optimal provider using the task's policy.
 * Returns a RoutingDecision with provider selection and fallback chain.
 */
export function routeTask(task: AITaskType, prompt?: string): RoutingDecision {
    const profile = getTaskProfile(task);
    const promptHash = prompt ? hashPromptForRouting(prompt) : undefined;
    return chooseProvider(profile.policy, promptHash);
}

/**
 * Execute an AI call routed by task type through the unified pipeline.
 *
 * Pipeline: TaskProfile → Route → Cache → Dedup → RateLimit → Retry → Provider → Cache write
 *
 * This is the recommended entry point for all AI calls in the InfinityCN pipeline.
 */
export async function callByTask(
    task: AITaskType,
    prompt: string,
    config: AIConfig,
    options?: { userId?: string; sceneId?: string },
): Promise<{
    result: string;
    provider: string;
    task: AITaskType;
    cacheHit: boolean;
    deduplicated: boolean;
}> {
    const profile = getTaskProfile(task);
    const routing = routeTask(task, prompt);
    const pipeline = getDefaultPipeline();

    // Build config override from task profile
    const taskConfig: AIConfig = {
        ...config,
        provider: routing.provider,
        rawTextMode: profile.rawTextMode,
    };

    const result = await pipeline.call({
        prompt,
        provider: routing.provider,
        model: config.model,
        userId: options?.userId ?? 'default',
        sceneId: options?.sceneId,
        options: {
            temperature: profile.temperature,
            requireJSON: profile.requireJSON,
            systemPrompt: profile.systemPrompt,
        },
        execute: async (provider) => {
            const providerConfig: AIConfig = {
                ...taskConfig,
                provider: provider as AIConfig['provider'],
            };
            const prepared = prepareAICall(prompt, providerConfig);
            const limiter = getRateLimiter(provider);
            await limiter.acquire({
                requests: 1,
                tokens: prepared.tokenPlan.totalBudgetTokens,
            });
            return callAI(prompt, providerConfig, prepared);
        },
    });

    return {
        result: result.result,
        provider: result.provider,
        task,
        cacheHit: result.cacheHit,
        deduplicated: result.deduplicated,
    };
}

/**
 * Create a deterministic cache key for a task + prompt combination.
 * Useful for external cache checks before calling callByTask.
 */
export function getTaskCacheKey(task: AITaskType, prompt: string, model?: string): string {
    const profile = getTaskProfile(task);
    const routing = routeTask(task, prompt);
    return createCacheKey({
        provider: routing.provider,
        model,
        prompt,
        options: {
            task,
            temperature: profile.temperature,
        },
    });
}
