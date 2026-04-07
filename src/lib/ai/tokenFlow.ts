/**
 * ai/tokenFlow.ts — Token estimation and request budget planning
 *
 * Provides lightweight token estimation and context-window planning so request
 * flow can enforce both RPM and TPM budgets before dispatching provider calls.
 */

const CHARS_PER_TOKEN_ESTIMATE = 4;
const CHUNK_OVERHEAD_TOKENS = 8;

export interface TokenPlan {
    prompt: string;
    promptTokens: number;
    maxOutputTokens: number;
    totalBudgetTokens: number;
}

export function estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE));
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function trimPromptForBudget(prompt: string, tokenBudget: number): string {
    if (tokenBudget <= 0) return '';

    const maxChars = tokenBudget * CHARS_PER_TOKEN_ESTIMATE;
    if (prompt.length <= maxChars) return prompt;

    // Keep both opening context and the latest segment for coherence.
    const lead = Math.max(0, Math.floor(maxChars * 0.2));
    const tail = Math.max(0, maxChars - lead - 48);

    return `${prompt.slice(0, lead)}\n\n...[prompt truncated to fit token budget]...\n\n${prompt.slice(
        Math.max(0, prompt.length - tail),
    )}`;
}

export function buildTokenPlan(
    prompt: string,
    systemPrompt: string,
    desiredMaxOutputTokens: number,
    contextWindow: number,
): TokenPlan {
    const safeContextWindow = Math.max(256, contextWindow);
    const systemTokens = estimateTokens(systemPrompt);

    let safePrompt = prompt;
    let promptTokens = estimateTokens(prompt) + systemTokens + CHUNK_OVERHEAD_TOKENS;

    let maxOutputTokens = clamp(desiredMaxOutputTokens, 64, safeContextWindow);

    if (promptTokens + maxOutputTokens > safeContextWindow) {
        const maxInputTokens = Math.max(64, safeContextWindow - maxOutputTokens);
        const promptOnlyBudget = Math.max(0, maxInputTokens - systemTokens - CHUNK_OVERHEAD_TOKENS);

        safePrompt = trimPromptForBudget(prompt, promptOnlyBudget);
        promptTokens = estimateTokens(safePrompt) + systemTokens + CHUNK_OVERHEAD_TOKENS;

        if (promptTokens + maxOutputTokens > safeContextWindow) {
            maxOutputTokens = clamp(safeContextWindow - promptTokens, 64, desiredMaxOutputTokens);
        }
    }

    const totalBudgetTokens = Math.max(promptTokens + maxOutputTokens, 1);

    return {
        prompt: safePrompt,
        promptTokens,
        maxOutputTokens,
        totalBudgetTokens,
    };
}
