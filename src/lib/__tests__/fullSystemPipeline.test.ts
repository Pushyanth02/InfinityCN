import { beforeEach, describe, expect, it } from 'vitest';
import type { AIConfig } from '../ai';
import { runFullSystemPipeline, clearFullSystemPipelineCache } from '../cinematifier';

function makeConfig(provider: AIConfig['provider']): AIConfig {
    return {
        provider,
        model: '',
        universalApiKey: '',
        geminiKey: '',
        useSearchGrounding: false,
        openAiKey: '',
        anthropicKey: '',
        groqKey: '',
        deepseekKey: '',
        ollamaUrl: 'http://localhost:11434',
        ollamaModel: 'llama3',
    };
}

function canonicalWithoutWhitespace(text: string): string {
    return text.replace(/\s+/g, '').trim();
}

function assertNoAdjacentDuplicateBlocks(
    blocks: Array<{ type: string; speaker?: string; content: string }>,
): void {
    const keys = blocks.map(block =>
        [block.type, block.speaker ?? '', canonicalWithoutWhitespace(block.content)].join('|'),
    );

    for (let i = 1; i < keys.length; i++) {
        expect(keys[i]).not.toBe(keys[i - 1]);
    }
}

describe('fullSystemPipeline', () => {
    beforeEach(() => {
        clearFullSystemPipelineCache();
    });

    it('runs full chapter flow and returns original plus cinematized outputs', async () => {
        const text =
            'At dawn the station was silent. Wind scraped the signs.\n\n"Move now," Mara whispered.\n\nA siren broke the stillness.';

        const result = await runFullSystemPipeline(text, makeConfig('none'));

        expect(result.cacheHit).toBe(false);
        expect(result.rebuiltText.length).toBeGreaterThan(0);
        expect(result.dialogueText.length).toBeGreaterThan(0);
        expect(result.originalMode.text.length).toBeGreaterThan(0);
        expect(result.originalMode.scenes.length).toBeGreaterThan(0);

        // No text loss or duplication in original mode transformations.
        expect(canonicalWithoutWhitespace(result.dialogueText)).toBe(
            canonicalWithoutWhitespace(result.rebuiltText),
        );
        expect(canonicalWithoutWhitespace(result.originalMode.text)).toBe(
            canonicalWithoutWhitespace(result.rebuiltText),
        );

        // Formatting correctness for original mode output.
        expect(result.originalMode.text).not.toMatch(/\n{3,}/);
        expect(result.originalMode.text).toBe(result.originalMode.text.trim());

        // Scene consistency: stitched scene text must match original mode text canonically.
        const stitchedScenes = result.originalMode.scenes.map(scene => scene.text).join('\n\n');
        expect(canonicalWithoutWhitespace(stitchedScenes)).toBe(
            canonicalWithoutWhitespace(result.originalMode.text),
        );

        expect(result.cinematizedMode.blocks.length).toBeGreaterThan(0);
        expect(result.cinematizedMode.renderPlan).toBeDefined();
        expect(result.cinematizedMode.stageTrace?.at(0)?.stageName).toBe('Scene Segmentation');
        expect(result.cinematizedMode.stageTrace?.at(-1)?.stageName).toBe('Renderer');

        // No adjacent duplicate cinematic blocks after sanitization.
        assertNoAdjacentDuplicateBlocks(result.cinematizedMode.blocks);
    });
});
