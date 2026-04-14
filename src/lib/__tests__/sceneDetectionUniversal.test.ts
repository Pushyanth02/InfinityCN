import { describe, expect, it } from 'vitest';
import { detectOriginalModeScenes, segmentScenesUniversal } from '../cinematifier/sceneDetection';

describe('segmentScenesUniversal (Prompt 2B)', () => {
    it('splits scenes on time shifts', () => {
        const text = [
            'The village slept under a pale moon.',
            'Hours later, the bell tower rang once and everyone woke.',
        ].join('\n\n');

        const scenes = segmentScenesUniversal(text);
        expect(scenes.length).toBe(2);
        expect(scenes[0].id).toBe('scene-1');
        expect(scenes[1].id).toBe('scene-2');
    });

    it('splits scenes on location changes', () => {
        const text = [
            'At Rivergate, the market opened before sunrise.',
            'In Stonekeep, soldiers checked the northern wall.',
        ].join('\n\n');

        const scenes = segmentScenesUniversal(text);
        expect(scenes.length).toBe(2);
    });

    it('splits scenes on narrative transitions', () => {
        const text = [
            'Mara watched the road and waited for dawn.',
            'Meanwhile, her brother crossed the frozen valley alone.',
        ].join('\n\n');

        const scenes = segmentScenesUniversal(text);
        expect(scenes.length).toBe(2);
    });

    it('splits scenes on emotional reset', () => {
        const text = [
            'She felt joy and relief, smiling with hope as the warm sun returned.',
            'He felt terror, dread, and panic as danger closed in and people screamed.',
        ].join('\n\n');

        const scenes = segmentScenesUniversal(text);
        expect(scenes.length).toBe(2);
    });

    it('returns Scene[] with id and text for mixed novel-like flow', () => {
        const text = [
            'At Dawnmere, the harbor was quiet and cold.',
            'The crew loaded food in silence.',
            'Days later, storms pushed them toward the black cliffs.',
            'Meanwhile, in Brightfall, the queen read the final warning.',
        ].join('\n\n');

        const scenes = segmentScenesUniversal(text);

        expect(scenes.length).toBeGreaterThanOrEqual(3);
        for (const scene of scenes) {
            expect(scene.id).toMatch(/^scene-\d+$/);
            expect(scene.text.trim().length).toBeGreaterThan(0);
        }
    });
});

describe('detectOriginalModeScenes', () => {
    it('splits scenes on time shift phrases', () => {
        const text =
            'The campfire burned low as they waited.\n\nHours later, the first horn echoed from the ridge.';

        const scenes = detectOriginalModeScenes(text);
        expect(scenes.length).toBe(2);
        expect(scenes[0].id).toBe('scene-1');
        expect(scenes[1].id).toBe('scene-2');
    });

    it('splits scenes on location changes', () => {
        const text =
            'At Rivergate, the docks were crowded before sunrise.\n\nIn Stonekeep, the gates remained closed.';

        const scenes = detectOriginalModeScenes(text);
        expect(scenes.length).toBe(2);
    });

    it('splits scenes on strong paragraph breaks', () => {
        const text = 'Mara checked the maps.\n\n\n\nThe scouts returned with grim news.';
        const scenes = detectOriginalModeScenes(text);

        expect(scenes.length).toBe(2);
        expect(scenes[0].text).toContain('Mara checked the maps.');
        expect(scenes[1].text).toContain('The scouts returned with grim news.');
    });

    it('returns deterministic Scene[] shape with id and text', () => {
        const text =
            'At dawn, the road was empty.\n\nMeanwhile, in Highwatch, the bells rang.\n\n\n\nBy dusk, the gates were shut.';

        const scenes = detectOriginalModeScenes(text);

        expect(scenes.length).toBeGreaterThanOrEqual(2);
        for (const scene of scenes) {
            expect(scene.id).toMatch(/^scene-\d+$/);
            expect(scene.text.trim().length).toBeGreaterThan(0);
        }
    });
});
