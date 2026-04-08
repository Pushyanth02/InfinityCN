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

    it('cinematizeScene breaks dense paragraphs into cinematic units', () => {
        const scene =
            'The train rolled through the valley while rain hammered the roof and distant thunder echoed across the cliffs. Mara kept reading the map while Eli watched the tracks disappear into fog. The lantern shook in his hand as the carriage leaned and every bolt groaned. Nobody spoke as the wind kept pressing harder against the windows.';

        const out = cinematizeScene(scene);
        expect(out.split('\n\n').length).toBeGreaterThan(2);
    });

    it('cinematizeScene isolates dramatic lines with tension spacing', () => {
        const scene = 'The hallway went dark. Run now! Glass shattered. Hide!';
        const out = cinematizeScene(scene);

        expect(out).toMatch(/Run now!\n\n/);
        expect(out).toMatch(/Hide!/);
    });

    it('cinematizeScene preserves story words without adding new narrative content', () => {
        const scene = '"Stay here," Mara said. The door slammed shut. He heard footsteps.';
        const out = cinematizeScene(scene);

        const normalize = (text: string) =>
            text
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, ' ')
                .split(/\s+/)
                .filter(Boolean);

        expect(normalize(out)).toEqual(normalize(scene));
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
