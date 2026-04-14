import { describe, expect, it } from 'vitest';
import {
    rebuildParagraphs,
    segmentScenes,
    analyzeScene,
    applyTensionFormatting,
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
        expect(analysis.dialogueRatio).toBeGreaterThanOrEqual(0);
        expect(analysis.dialogueRatio).toBeLessThanOrEqual(1);
        expect(analysis.emotionalCharge).toBeGreaterThanOrEqual(0);
    });

    it('applyTensionFormatting uses short lines for high tension', () => {
        const input = 'The corridor lights flickered while footsteps echoed behind the steel door.';

        const out = applyTensionFormatting(input, 90);
        expect(out).toContain('\n');
        expect(out.split('\n').length).toBeGreaterThan(1);
    });

    it('applyTensionFormatting keeps normal paragraphs for low tension', () => {
        const input =
            'Morning sunlight covered the valley. The birds circled slowly over the river.';

        const out = applyTensionFormatting(input, 10);
        expect(out).toContain(
            'Morning sunlight covered the valley. The birds circled slowly over the river.',
        );
    });

    it('applyTensionFormatting isolates sentences for suspense range', () => {
        const input = 'He waited at the door. The lock clicked. Nobody moved.';

        const out = applyTensionFormatting(input, 52);
        expect(out).toMatch(/He waited at the door\.\n\nThe lock clicked\.\n\nNobody moved\./);
    });

    it('applyTensionFormatting preserves exact non-whitespace content', () => {
        const input = 'Run now! The lights failed. He held his breath.';
        const out = applyTensionFormatting(input, 85);

        const canonical = (text: string) => text.replace(/\s+/g, '');
        expect(canonical(out)).toBe(canonical(input));
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

    it('cinematizeScene preserves exact non-whitespace content', () => {
        const scene = 'The alarm rang. "Move now," Mara said. Then silence.';
        const out = cinematizeScene(scene);

        const canonical = (text: string) => text.replace(/\s+/g, '');
        expect(canonical(out)).toBe(canonical(scene));
    });

    it('cinematizeScene isolates short dramatic lines as cinematic beats', () => {
        const scene = 'They waited in the dark corridor. Run now! No time. The lights failed.';
        const out = cinematizeScene(scene);

        expect(out).toContain('Run now!');
        expect(out).toContain('No time.');
        expect(out).toMatch(/Run now!\n\nNo time\./);
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
        expect(result.outputText).toContain('[CAMERA:');
        expect(result.outputText).toContain('[SCENE:');
        expect(result.outputText).toContain('[SFX: gunshot]');
        expect(result.validation).toBeDefined();
    });

    it('runCorePipeline adds transition markers between scenes', () => {
        const input =
            'The room was calm and silent at first.\n\n***\n\nRun now! Danger is at the door and everyone screamed.';

        const result = runCorePipeline(input);

        expect(result.outputText).toContain('[TRANSITION:');
        expect(result.outputText.match(/\[TRANSITION:/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    });

    it('runCorePipeline adds at most one tension wrapper per scene', () => {
        const input =
            'Run now! Danger is everywhere. The alarm screamed and footsteps rushed the hall. Everyone froze.';

        const result = runCorePipeline(input);
        const openCount = (result.outputText.match(/\[TENSION\]/g) || []).length;
        const closeCount = (result.outputText.match(/\[\/TENSION\]/g) || []).length;

        expect(openCount).toBeLessThanOrEqual(result.scenes.length);
        expect(openCount).toBe(closeCount);
    });

    it('runCorePipeline avoids unnecessary markers on calm narrative', () => {
        const input =
            'Morning light touched the old library. Dust moved through the quiet aisles as she turned the page.';

        const result = runCorePipeline(input);

        expect(result.outputText).toContain('[SCENE:');
        expect(result.outputText).not.toContain('[TENSION]');
        expect(result.outputText).not.toContain('[SFX:');
    });
});
