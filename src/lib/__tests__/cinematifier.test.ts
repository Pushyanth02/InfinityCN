/**
 * cinematifier.test.ts — Tests for cinematifier engine fixes
 */

import { parseCinematifiedText, cinematifyOffline, detectSceneBreaks } from '../cinematifier';

describe('parseCinematifiedText', () => {
    it('parses FADE TO BLACK as a valid transition', () => {
        const blocks = parseCinematifiedText('FADE TO BLACK');
        expect(blocks.length).toBe(1);
        expect(blocks[0].type).toBe('transition');
        expect(blocks[0].transition?.type).toBe('FADE TO BLACK');
    });

    it('parses FADE TO BLACK with description', () => {
        const blocks = parseCinematifiedText('FADE TO BLACK: The end of the chapter');
        expect(blocks.length).toBe(1);
        expect(blocks[0].type).toBe('transition');
        expect(blocks[0].transition?.type).toBe('FADE TO BLACK');
        expect(blocks[0].transition?.description).toBe('The end of the chapter');
    });

    it('parses FADE IN and FADE OUT as valid transitions', () => {
        const fadeIn = parseCinematifiedText('FADE IN');
        expect(fadeIn[0].transition?.type).toBe('FADE IN');

        const fadeOut = parseCinematifiedText('FADE OUT');
        expect(fadeOut[0].transition?.type).toBe('FADE OUT');
    });

    it('parses SFX annotations', () => {
        const blocks = parseCinematifiedText('SFX: BOOM!');
        expect(blocks.length).toBe(1);
        expect(blocks[0].type).toBe('sfx');
        expect(blocks[0].sfx?.sound).toBe('BOOM!');
    });

    it('parses BEAT markers', () => {
        const blocks = parseCinematifiedText('BEAT');
        expect(blocks.length).toBe(1);
        expect(blocks[0].type).toBe('beat');
        expect(blocks[0].beat?.type).toBe('BEAT');
    });

    it('parses SILENCE markers', () => {
        const blocks = parseCinematifiedText('SILENCE');
        expect(blocks.length).toBe(1);
        expect(blocks[0].type).toBe('beat');
        expect(blocks[0].beat?.type).toBe('SILENCE');
    });

    it('parses dialogue with speaker detection', () => {
        const blocks = parseCinematifiedText('"Hello there!" said John');
        const dialogue = blocks.find(b => b.type === 'dialogue');
        expect(dialogue).toBeDefined();
        expect(dialogue?.content).toBe('Hello there!');
        expect(dialogue?.speaker).toBe('JOHN');
    });

    it('parses inline emotion tags', () => {
        const blocks = parseCinematifiedText('The room fell silent. [EMOTION: fear] [TENSION: 80]');
        expect(blocks.length).toBeGreaterThan(0);
        expect(blocks[0].emotion).toBe('fear');
        expect(blocks[0].tensionScore).toBe(80);
    });

    it('clamps tension score to 0-100', () => {
        const blocks = parseCinematifiedText('Something happened. [TENSION: 150]');
        expect(blocks[0].tensionScore).toBe(100);
    });

    it('generates unique block IDs', () => {
        const blocks = parseCinematifiedText('Line one.\n\nLine two.\n\nLine three.');
        const ids = blocks.map(b => b.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
    });

    // ─── Scene Marker Tests ──────────────────────────────────

    it('parses [SCENE: description] markers as title_card blocks', () => {
        const blocks = parseCinematifiedText('[SCENE: Abandoned Mountain Path]');
        expect(blocks.length).toBe(1);
        expect(blocks[0].type).toBe('title_card');
        expect(blocks[0].content).toBe('Abandoned Mountain Path');
    });

    it('parses scene markers with surrounding text', () => {
        const text = `[SCENE: Forest Clearing]

The wind rustled through the trees.

— ✦ —

[SCENE: Cave Entrance]

The air smelled damp.`;
        const blocks = parseCinematifiedText(text);

        const titleCards = blocks.filter(b => b.type === 'title_card');
        expect(titleCards.length).toBe(2);
        expect(titleCards[0].content).toBe('Forest Clearing');
        expect(titleCards[1].content).toBe('Cave Entrance');

        const sceneBreaks = blocks.filter(b => b.type === 'beat' && b.content === '— ✦ —');
        expect(sceneBreaks.length).toBe(1);
    });

    it('parses scene break markers (— ✦ —)', () => {
        const blocks = parseCinematifiedText('Some text.\n\n— ✦ —\n\nMore text.');
        const breaks = blocks.filter(b => b.type === 'beat' && b.content === '— ✦ —');
        expect(breaks.length).toBe(1);
        expect(breaks[0].beat?.type).toBe('PAUSE');
    });

    it('parses *** as scene break', () => {
        const blocks = parseCinematifiedText('Before.\n\n***\n\nAfter.');
        const breaks = blocks.filter(b => b.type === 'beat' && b.content === '— ✦ —');
        expect(breaks.length).toBe(1);
    });

    // ─── Wrapper Block Tests ─────────────────────────────────

    it('parses [TENSION] wrapper blocks with heightened tension', () => {
        const text = `[TENSION]
Footsteps approached.
Closer.
Closer.
[/TENSION]`;
        const blocks = parseCinematifiedText(text);

        // All content inside [TENSION] should be action blocks with heightened tension
        expect(blocks.length).toBe(3);
        blocks.forEach(block => {
            expect(block.type).toBe('action');
            expect(block.intensity).toBe('emphasis');
            expect(block.tensionScore).toBe(80);
            expect(block.emotion).toBe('suspense');
        });
    });

    it('parses [REFLECTION] wrapper blocks as inner_thought', () => {
        const text = `[REFLECTION]
She remembered the old house.
The way the light fell through the window.
[/REFLECTION]`;
        const blocks = parseCinematifiedText(text);

        expect(blocks.length).toBe(2);
        blocks.forEach(block => {
            expect(block.type).toBe('inner_thought');
            expect(block.intensity).toBe('whisper');
        });
    });

    it('parses mixed content with scene markers, SFX, and wrappers', () => {
        const text = `[SCENE: Forest Clearing]

The wind rustled through the trees.

— ✦ —

"You shouldn't have followed me."

SFX: distant thunder

[TENSION]
Footsteps approached.
Closer.
[/TENSION]`;
        const blocks = parseCinematifiedText(text);

        expect(blocks.some(b => b.type === 'title_card')).toBe(true);
        expect(blocks.some(b => b.type === 'beat' && b.content === '— ✦ —')).toBe(true);
        expect(blocks.some(b => b.type === 'dialogue')).toBe(true);
        expect(blocks.some(b => b.type === 'sfx')).toBe(true);
        expect(blocks.some(b => b.type === 'action' && b.tensionScore === 80)).toBe(true);
    });
});

// ─── Scene Detection Tests ──────────────────────────────────

describe('detectSceneBreaks', () => {
    it('detects scene breaks from time-shift phrases', () => {
        const paragraphs = [
            'The sun was bright.',
            'They walked along the river.',
            'Hours later, they arrived at the cabin.',
            'The fire was already lit.',
        ];
        const scenes = detectSceneBreaks(paragraphs);
        expect(scenes.length).toBe(2);
        expect(scenes[0].length).toBe(2);
        expect(scenes[1].length).toBe(2);
    });

    it('detects "meanwhile" as scene break', () => {
        const paragraphs = [
            'John was at home.',
            'Meanwhile, Sarah was running.',
            'She turned the corner.',
        ];
        const scenes = detectSceneBreaks(paragraphs);
        expect(scenes.length).toBe(2);
    });

    it('returns single scene if no breaks detected', () => {
        const paragraphs = ['First.', 'Second.', 'Third.'];
        const scenes = detectSceneBreaks(paragraphs);
        expect(scenes.length).toBe(1);
        expect(scenes[0].length).toBe(3);
    });

    it('handles empty input', () => {
        const scenes = detectSceneBreaks([]);
        expect(scenes.length).toBe(0);
    });

    it('detects multiple scene signals', () => {
        const paragraphs = [
            'Morning.',
            'The next morning, everything changed.',
            'New beginning.',
            'Elsewhere, trouble was brewing.',
            'End.',
        ];
        const scenes = detectSceneBreaks(paragraphs);
        expect(scenes.length).toBe(3);
    });
});

describe('cinematifyOffline', () => {
    it('creates blocks from text paragraphs', () => {
        const text = 'The storm was approaching.\n\nLightning struck the tower.';
        const result = cinematifyOffline(text);

        expect(result.blocks.length).toBeGreaterThan(0);
        expect(result.metadata.originalWordCount).toBeGreaterThan(0);
        expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('detects dialogue in offline mode', () => {
        const text = '"We need to leave now!" shouted Sarah.';
        const result = cinematifyOffline(text);

        const dialogue = result.blocks.find(b => b.type === 'dialogue');
        expect(dialogue).toBeDefined();
        expect(dialogue?.content).toContain('We need to leave now!');
    });

    it('detects SFX triggers from keywords', () => {
        const text = 'Thunder echoed across the valley.';
        const result = cinematifyOffline(text);

        const sfx = result.blocks.find(b => b.type === 'sfx');
        expect(sfx).toBeDefined();
    });

    it('inserts scene title cards when scene breaks are detected', () => {
        const text =
            'The sun was bright and warm.\n\nHours later, they arrived at the dark cabin.\n\nThe fire was already lit.';
        const result = cinematifyOffline(text);

        const titleCards = result.blocks.filter(b => b.type === 'title_card');
        // Should have at least one scene title when multiple scenes detected
        expect(titleCards.length).toBeGreaterThanOrEqual(1);
    });
});
