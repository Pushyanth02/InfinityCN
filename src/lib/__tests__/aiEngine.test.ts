import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cinematifyText, validateAICinematification } from '../engine/cinematifier/aiEngine';
import * as aiModule from '../ai';
import type { AIConfig } from '../ai';
import * as embeddingsModule from '../ai/embeddings';
import type { CinematicBlock } from '../../types/cinematifier';

// Mock the AI module
vi.mock('../ai', async importOriginal => {
    const actual = await importOriginal<typeof import('../ai')>();
    return {
        ...actual,
        callAIManaged: vi.fn(),
        streamAIManaged: vi.fn(),
    };
});

// Mock the embeddings module
vi.mock('../ai/embeddings', () => ({
    generateEmbedding: vi.fn(),
    retrieveRelevantContext: vi.fn(),
}));

describe('AI Engine', () => {
    const mockConfig = {
        provider: 'openai' as const,
        model: 'gpt-4o-mini',
        openAiKey: 'test',
    } as unknown as AIConfig;

    beforeEach(() => {
        vi.clearAllMocks();
        // Setup default mocks
        vi.mocked(aiModule.callAIManaged).mockResolvedValue({
            text: 'Mocked response',
            providerUsed: 'openai',
            attemptedProviders: ['openai'],
            cacheHit: false,
            estimatedCostUsd: 0,
            actualCostUsd: 0,
        });

        // Mock streamAIManaged to return an async iterable
        vi.mocked(aiModule.streamAIManaged).mockImplementation(async function* () {
            yield 'Mocked ';
            yield 'streaming ';
            yield 'response.';
        });

        vi.mocked(embeddingsModule.generateEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
        vi.mocked(embeddingsModule.retrieveRelevantContext).mockReturnValue([]);
    });

    describe('validateAICinematification', () => {
        it('throws if zero blocks are returned from valid input', () => {
            expect(() => validateAICinematification([], 100)).toThrow(/Zero blocks produced/);
        });

        it('throws if valid word count drops significantly without dialogue', () => {
            const blocks: CinematicBlock[] = [
                { id: '1', type: 'action', content: 'Short summary.', intensity: 'normal' },
            ];
            expect(() => validateAICinematification(blocks, 100)).toThrow(/Significant word loss/);
        });

        it('does not throw if word count drops but scene is heavily dialogue action', () => {
            const blocks: CinematicBlock[] = [
                { id: '1', type: 'dialogue', content: 'Go.', speaker: 'JOHN', intensity: 'shout' },
            ];
            expect(() => validateAICinematification(blocks, 100)).not.toThrow();
        });

        it('does not throw on normal word count retention', () => {
            const blocks: CinematicBlock[] = [
                {
                    id: '1',
                    type: 'action',
                    content: 'A properly long paragraph that is at least somewhat lengthy.',
                    intensity: 'normal',
                }, // 11 words
            ];
            expect(() => validateAICinematification(blocks, 15)).not.toThrow(); // > 60% of 15 is 9
        });
    });

    describe('cinematifyText Execution (Streaming / Bulk)', () => {
        it('calls streamAI and parses blocks when provider supports streaming', async () => {
            const mockRawResponse = `The sun set. [EMOTION: neutral] [TENSION: 20]

[SUMMARY: The sun sets gracefully.]`;

            vi.mocked(aiModule.streamAIManaged).mockImplementation(async function* () {
                yield mockRawResponse;
            });

            const result = await cinematifyText('The sun set.', mockConfig);

            expect(aiModule.streamAIManaged).toHaveBeenCalledOnce();
            expect(result.blocks.length).toBeGreaterThan(0);
            expect(result.blocks[0].content).toContain('The sun set');
        });

        it('appends offline blocks when AI validation fails (hallucination)', async () => {
            // Mock an AI response that causes significant word loss
            vi.mocked(aiModule.streamAIManaged).mockImplementation(async function* () {
                yield 'Short summary.';
            });

            const text = 'This is a normally long text paragraph. '.repeat(15);
            const result = await cinematifyText(text, mockConfig);

            // Expected: AI call happened
            expect(aiModule.streamAIManaged).toHaveBeenCalled();
            // Expected: Validation failed, catch block fell back to offline engine, preserving words
            expect(result.metadata.cinematifiedWordCount).toBeGreaterThan(15);
            expect(result.blocks.some(b => b.content?.includes('normally long'))).toBe(true);
        });
    });
});
