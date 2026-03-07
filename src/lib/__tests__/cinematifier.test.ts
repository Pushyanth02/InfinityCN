/**
 * cinematifier.test.ts — Tests for cinematifier engine fixes
 */

import { parseCinematifiedText, cinematifyOffline } from '../cinematifier';

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
});
