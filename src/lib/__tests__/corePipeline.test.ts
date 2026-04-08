import { describe, expect, it } from 'vitest';
import {
    rebuildParagraphs,
    segmentScenes,
    analyzeScene,
    cinematizeScene,
    validateOutput,
    runCorePipeline,
} from '../cinematifier/corePipeline';

describe('corePipeline (Prompt 2A)', () => {
    it('rebuildParagraphs reconstructs paragraph boundaries', () => {
        const raw =
            'John stepped into the room. He looked around carefully. "Who is there?" he asked. The wind hit the windows hard.';

        const rebuilt = rebuildParagraphs(raw);
        expect(rebuilt).toContain('\n\n');
    });

    it('segmentScenes splits text into titled scenes', () => {
        const text =
            'At dawn the village was quiet. Birds moved over the trees.\n\n***\n\nLater that night, alarms rang across town.';

        const scenes = segmentScenes(text);
        expect(scenes.length).toBe(2);
        expect(scenes[0].title.length).toBeGreaterThan(0);
        expect(scenes[1].title.length).toBeGreaterThan(0);
    });

    it('analyzeScene detects tension and short lines', () => {
        const scene = 'Run now!\n\nDanger is close.\n\nHe screamed.';
        const analysis = analyzeScene(scene);

        expect(analysis.tensionScore).toBeGreaterThan(0);
        expect(analysis.shortLineCount).toBeGreaterThan(0);
    });

    it('cinematizeScene separates dialogue clearly', () => {
        const scene = '"Stop," she said. "Don\'t move." He froze at the doorway.';
        const out = cinematizeScene(scene);

        expect(out).toMatch(/\n\s*"Don't move\./);
    });

    it('validateOutput returns valid result for clean output', () => {
        const text = '"We wait."\n\nThe room stayed quiet.';
        const validation = validateOutput(text);

        expect(validation.isValid).toBe(true);
        expect(validation.dialogueSeparated).toBe(true);
    });

    it('runCorePipeline executes all stages and returns combined output', () => {
        const input =
            'At dawn the road was empty. "Keep moving," Mara said.\n\n***\n\nSuddenly, a gunshot cracked through the trees.';

        const result = runCorePipeline(input);
        expect(result.rebuiltText.length).toBeGreaterThan(0);
        expect(result.scenes.length).toBeGreaterThan(0);
        expect(result.outputText.length).toBeGreaterThan(0);
        expect(result.validation).toBeDefined();
    });
});
