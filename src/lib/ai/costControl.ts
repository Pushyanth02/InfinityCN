/**
 * ai/costControl.ts — Cost estimation and budget helpers
 *
 * Uses lightweight per-provider token pricing estimates for routing and budget
 * guardrails. Values are intentionally conservative and are only used for
 * relative provider selection and safety checks.
 */

export type CostProvider = 'openai' | 'gemini' | 'claude';

export interface ProviderTokenPricing {
    /** USD per 1M input tokens */
    inputPerMillionUsd: number;
    /** USD per 1M output tokens */
    outputPerMillionUsd: number;
}

const PROVIDER_PRICING: Record<CostProvider, ProviderTokenPricing> = {
    // GPT-4o mini class pricing profile (approximate)
    openai: {
        inputPerMillionUsd: 0.15,
        outputPerMillionUsd: 0.6,
    },
    // Gemini Flash class pricing profile (approximate)
    gemini: {
        inputPerMillionUsd: 0.1,
        outputPerMillionUsd: 0.4,
    },
    // Claude Sonnet class pricing profile (approximate)
    claude: {
        inputPerMillionUsd: 3,
        outputPerMillionUsd: 15,
    },
};

export function getProviderPricing(provider: CostProvider): ProviderTokenPricing {
    return PROVIDER_PRICING[provider];
}

export function estimateProviderCallCostUsd(
    provider: CostProvider,
    inputTokens: number,
    outputTokens: number,
): number {
    const pricing = getProviderPricing(provider);
    const safeInputTokens = Math.max(0, inputTokens);
    const safeOutputTokens = Math.max(0, outputTokens);

    const inputCost = (safeInputTokens / 1_000_000) * pricing.inputPerMillionUsd;
    const outputCost = (safeOutputTokens / 1_000_000) * pricing.outputPerMillionUsd;

    return inputCost + outputCost;
}

export function isWithinCostBudget(estimatedCostUsd: number, maxCostUsd?: number): boolean {
    if (maxCostUsd === undefined) return true;
    return estimatedCostUsd <= maxCostUsd;
}

export function sortProvidersByEstimatedCost<T extends CostProvider>(
    providers: T[],
    estimate: (provider: T) => number,
): T[] {
    return providers
        .map((provider, index) => ({ provider, index, cost: estimate(provider) }))
        .sort((a, b) => {
            if (a.cost === b.cost) return a.index - b.index;
            return a.cost - b.cost;
        })
        .map(entry => entry.provider);
}
