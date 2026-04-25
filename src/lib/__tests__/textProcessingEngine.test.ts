/**
 * textProcessingEngine.test.ts — Tests for the Deterministic Text Processing Engine
 *
 * Covers:
 *   • cleanOCRArtifacts    — OCR noise removal
 *   • reconstructParagraphs — paragraph boundary detection + line merging
 *   • detectDialogue       — speaker detection, dialogue/narration separation
 *   • segmentScenes        — multi-signal scene break detection
 *   • processText          — full pipeline integration
 */

import { describe, it, expect } from 'vitest';
import {
    processText,
    reconstructParagraphs,
    detectDialogue,
    segmentScenes,
    cleanOCRArtifacts,
} from '../engine/cinematifier/textProcessingEngine';
// ─── cleanOCRArtifacts ─────────────────────────────────────────────────────────

describe('cleanOCRArtifacts', () => {
    it('strips control characters', () => {
        const text = 'Hello\x00World\x07Test';
        expect(cleanOCRArtifacts(text)).toBe('HelloWorldTest');
    });

    it('removes form feed characters as paragraph breaks', () => {
        const result = cleanOCRArtifacts('Page one.\fPage two.');
        expect(result).toContain('Page one.');
        expect(result).toContain('Page two.');
        expect(result).not.toContain('\f');
    });

    it('replaces tabs with spaces', () => {
        expect(cleanOCRArtifacts('col1\t\tcol2')).toBe('col1 col2');
    });

    it('collapses excessive dots', () => {
        expect(cleanOCRArtifacts('end.......next')).toBe('end...next');
    });

    it('strips stray diacritical marks', () => {
        expect(cleanOCRArtifacts('word`s ´fine')).toBe('words fine');
    });

    it('fixes hyphenated line breaks', () => {
        expect(cleanOCRArtifacts('con-\nnection')).toBe('connection');
    });

    it('removes standalone page numbers', () => {
        const text = 'Some text.\n42\nMore text.';
        const result = cleanOCRArtifacts(text);
        expect(result).not.toMatch(/^\s*42\s*$/m);
    });

    it('handles empty input', () => {
        expect(cleanOCRArtifacts('')).toBe('');
    });
});

// ─── reconstructParagraphs ─────────────────────────────────────────────────────

describe('reconstructParagraphs', () => {
    it('returns empty array for empty input', () => {
        expect(reconstructParagraphs('')).toEqual([]);
    });

    it('returns ProcessedParagraph objects with correct structure', () => {
        const paragraphs = reconstructParagraphs('Hello world. This is a test.');
        expect(paragraphs.length).toBeGreaterThan(0);
        expect(paragraphs[0]).toHaveProperty('index');
        expect(paragraphs[0]).toHaveProperty('text');
        expect(paragraphs[0]).toHaveProperty('wordCount');
        expect(paragraphs[0]).toHaveProperty('hasDialogue');
        expect(paragraphs[0]).toHaveProperty('isHeading');
        expect(paragraphs[0]).toHaveProperty('fragments');
    });

    it('preserves content through paragraph reconstruction', () => {
        const text = 'The storm rolled over the valley while the old bridge shook.\n\nNobody moved until dawn.';
        const paragraphs = reconstructParagraphs(text);
        expect(paragraphs.length).toBe(2);
        expect(paragraphs[0].text).toContain('storm rolled over');
        expect(paragraphs[1].text).toContain('Nobody moved');
    });

    it('detects paragraph boundaries from double newlines', () => {
        const text = 'First paragraph here.\n\nSecond paragraph here.';
        const paragraphs = reconstructParagraphs(text);
        expect(paragraphs.length).toBe(2);
    });

    it('preserves word count accuracy', () => {
        const text = 'One two three four five.';
        const paragraphs = reconstructParagraphs(text);
        expect(paragraphs[0].wordCount).toBe(5);
    });

    it('detects headings', () => {
        const text = 'CHAPTER ONE\n\nThe day began quietly.';
        const paragraphs = reconstructParagraphs(text);
        const heading = paragraphs.find(p => p.isHeading);
        expect(heading).toBeDefined();
    });

    it('filters paragraphs below minimum word count', () => {
        const text = 'OK.\n\nThis is a longer paragraph with many words.';
        const paragraphs = reconstructParagraphs(text, { minParagraphWords: 3 });
        expect(paragraphs.every(p => p.wordCount >= 3)).toBe(true);
    });

    it('handles noisy OCR text with artifacts', () => {
        const text = '42\nThe hero walked.\f\nPage 3 of 100\nMore text here.';
        const paragraphs = reconstructParagraphs(text);
        const combined = paragraphs.map(p => p.text).join(' ');
        expect(combined).not.toContain('Page 3 of 100');
        expect(combined).toContain('hero walked');
    });

    it('skips cleaning when skipCleaning is true', () => {
        const text = 'Text with\ttabs preserved.';
        const paragraphs = reconstructParagraphs(text, { skipCleaning: true });
        // Should still process but not clean OCR artifacts
        expect(paragraphs.length).toBeGreaterThan(0);
    });

    it('marks paragraphs with dialogue', () => {
        const text = '"Hello," she said.\n\nThe room was quiet.';
        const paragraphs = reconstructParagraphs(text);
        expect(paragraphs.some(p => p.hasDialogue)).toBe(true);
        expect(paragraphs.some(p => !p.hasDialogue)).toBe(true);
    });
});

// ─── detectDialogue ────────────────────────────────────────────────────────────

describe('detectDialogue', () => {
    it('separates dialogue from narration fragments', () => {
        const paragraphs = reconstructParagraphs(
            'The room was dark. "Who goes there?" The door creaked.',
        );
        const enriched = detectDialogue(paragraphs);
        const allFragments = enriched.flatMap(p => p.fragments);

        expect(allFragments.some(f => f.type === 'dialogue')).toBe(true);
        expect(allFragments.some(f => f.type === 'narration')).toBe(true);
    });

    it('extracts dialogue content without quotes', () => {
        const paragraphs = reconstructParagraphs('"Run!" he shouted.');
        const enriched = detectDialogue(paragraphs);
        const dialogue = enriched.flatMap(p => p.fragments).find(f => f.type === 'dialogue');

        expect(dialogue).toBeDefined();
        expect(dialogue!.content).toBe('Run!');
    });

    it('detects speaker from trailing attribution', () => {
        const paragraphs = reconstructParagraphs('"We should leave," Mara said.');
        const enriched = detectDialogue(paragraphs);
        const dialogue = enriched.flatMap(p => p.fragments).find(f => f.type === 'dialogue');

        expect(dialogue?.speaker).toBe('Mara');
        expect(dialogue?.verb).toBe('said');
    });

    it('detects speaker from leading attribution', () => {
        const paragraphs = reconstructParagraphs('Jon whispered, "Keep your voice down."');
        const enriched = detectDialogue(paragraphs);
        const dialogue = enriched.flatMap(p => p.fragments).find(f => f.type === 'dialogue');

        expect(dialogue?.speaker).toBe('Jon');
        expect(dialogue?.verb).toBe('whispered');
    });

    it('handles pronoun speakers', () => {
        const paragraphs = reconstructParagraphs('"Not yet," she replied.');
        const enriched = detectDialogue(paragraphs);
        const dialogue = enriched.flatMap(p => p.fragments).find(f => f.type === 'dialogue');

        expect(dialogue?.speaker).toBe('she');
    });

    it('handles multiple dialogue fragments in one paragraph', () => {
        const paragraphs = reconstructParagraphs(
            '"Hello," said Jon. The room fell silent. "Goodbye," Mara whispered.',
        );
        const enriched = detectDialogue(paragraphs);
        const dialogues = enriched.flatMap(p => p.fragments).filter(f => f.type === 'dialogue');

        expect(dialogues.length).toBe(2);
    });

    it('does not flag narration-only paragraphs as having dialogue', () => {
        const paragraphs = reconstructParagraphs(
            'The sun rose slowly over the mountains. Birds sang in the trees.',
        );
        const enriched = detectDialogue(paragraphs);

        expect(enriched.every(p => !p.hasDialogue)).toBe(true);
    });

    it('preserves headings without fragment extraction', () => {
        const paragraphs = reconstructParagraphs('CHAPTER ONE\n\nThe day began.');
        const enriched = detectDialogue(paragraphs);
        const heading = enriched.find(p => p.isHeading);

        expect(heading).toBeDefined();
        expect(heading!.fragments.length).toBe(1);
    });
});

// ─── segmentScenes ─────────────────────────────────────────────────────────────

describe('segmentScenes', () => {
    it('returns empty array for empty input', () => {
        expect(segmentScenes([])).toEqual([]);
    });

    it('creates at least one scene from content', () => {
        const paragraphs = reconstructParagraphs(
            'The sun was bright. They walked along the river.',
        );
        const scenes = segmentScenes(paragraphs);
        expect(scenes.length).toBeGreaterThanOrEqual(1);
    });

    it('assigns scene IDs', () => {
        const paragraphs = reconstructParagraphs(
            'Morning.\n\nThe next morning, everything changed.\n\nNew day.',
        );
        const scenes = segmentScenes(paragraphs);
        expect(scenes[0].id).toBe('scene-1');
        if (scenes.length > 1) {
            expect(scenes[1].id).toBe('scene-2');
        }
    });

    it('detects time-shift scene breaks', () => {
        const text = [
            'The sun was bright.',
            'They walked along the river.',
            '',
            'Hours later, they arrived at the cabin.',
            'The fire was already lit.',
        ].join('\n');
        const paragraphs = reconstructParagraphs(text);
        const scenes = segmentScenes(paragraphs);

        expect(scenes.length).toBeGreaterThanOrEqual(2);
    });

    it('includes narrative mode detection', () => {
        const paragraphs = reconstructParagraphs(
            'She remembered when they were young. Long ago, the house had been full of laughter.',
        );
        const scenes = segmentScenes(paragraphs);

        expect(scenes[0].narrativeMode).toBeDefined();
    });

    it('includes sentiment scores', () => {
        const paragraphs = reconstructParagraphs('Joy filled the room. Everyone laughed and smiled.');
        const scenes = segmentScenes(paragraphs);

        expect(typeof scenes[0].sentimentScore).toBe('number');
    });

    it('sets breakReason to "start" for first scene', () => {
        const paragraphs = reconstructParagraphs('The story begins here.');
        const scenes = segmentScenes(paragraphs);

        expect(scenes[0].breakReason).toBe('start');
    });

    it('derives scene titles', () => {
        const paragraphs = reconstructParagraphs(
            'The sun set over the valley. Birds grew silent.',
        );
        const scenes = segmentScenes(paragraphs);

        expect(scenes[0].title).toBeDefined();
        expect(scenes[0].title.length).toBeGreaterThan(0);
    });

    it('detects scene breaks on "meanwhile"', () => {
        const text = [
            'John was at home working.',
            '',
            'Meanwhile, Sarah was running through the forest.',
            'She turned the corner.',
        ].join('\n');
        const paragraphs = reconstructParagraphs(text);
        const scenes = segmentScenes(paragraphs);

        expect(scenes.length).toBeGreaterThanOrEqual(2);
    });
});

// ─── processText (Full Pipeline) ───────────────────────────────────────────────

describe('processText', () => {
    it('returns NarrativeDocument structure', () => {
        const result = processText('Hello world.');
        expect(result).toHaveProperty('originalText');
        expect(result).toHaveProperty('cleanedText');
        expect(result).toHaveProperty('paragraphs');
        expect(result).toHaveProperty('scenes');
        expect(result).toHaveProperty('stats');
        expect(result).toHaveProperty('processingTimeMs');
    });

    it('preserves original text', () => {
        const raw = '  Messy   text\n\nhere. ';
        const result = processText(raw);
        expect(result.originalText).toBe(raw);
    });

    it('handles empty input gracefully', () => {
        const result = processText('');
        expect(result.paragraphs).toEqual([]);
        expect(result.scenes).toEqual([]);
        expect(result.stats.totalWords).toBe(0);
    });

    it('handles whitespace-only input', () => {
        const result = processText('   \n\n   ');
        expect(result.paragraphs).toEqual([]);
    });

    it('computes accurate word count', () => {
        const result = processText('One two three. Four five six.');
        expect(result.stats.totalWords).toBe(6);
    });

    it('detects unique speakers', () => {
        const text = '"Run!" shouted Mara. "Stay back!" Jon replied.';
        const result = processText(text);
        expect(result.stats.uniqueSpeakers).toContain('Mara');
        expect(result.stats.uniqueSpeakers).toContain('Jon');
    });

    it('computes dialogue ratio', () => {
        const text = '"Hello," she said. "World," he replied. The end.';
        const result = processText(text);
        expect(result.stats.dialogueRatio).toBeGreaterThan(0);
        expect(result.stats.dialogueRatio).toBeLessThanOrEqual(1);
    });

    it('computes processing time', () => {
        const result = processText('Some text to process.');
        expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('processes noisy OCR text end-to-end', () => {
        const ocrText = [
            '42',                              // page number
            'The hero walked through\tthe dense forest.',  // tab artifact
            'Page 3 of 100',                   // header
            '',
            '"Stay close," she whispered.',
            '',
            'Hours later, they reached the cave.',
            'The air smelled damp and cold.',
        ].join('\n');

        const result = processText(ocrText);

        // Should have cleaned artifacts
        expect(result.cleanedText).not.toContain('Page 3 of 100');

        // Should have paragraphs
        expect(result.stats.totalParagraphs).toBeGreaterThan(0);

        // Should detect dialogue
        expect(result.stats.dialogueFragments).toBeGreaterThan(0);

        // Should detect scenes (time shift: "Hours later")
        expect(result.stats.totalScenes).toBeGreaterThanOrEqual(1);
    });

    it('processes a full narrative passage', () => {
        const passage = [
            'The corridor was dark and wet. Rain hammered the windows.',
            '',
            '"We need to move," Mara said. Jon nodded silently.',
            '',
            '"Not yet," he whispered. "They might still be watching."',
            '',
            'Meanwhile, across the city, the alarm had already been raised.',
            'Soldiers poured into the streets.',
            '',
            'The next morning, everything was different.',
            'Sunlight streamed through broken glass.',
        ].join('\n');

        const result = processText(passage);

        // Validate structure
        expect(result.stats.totalParagraphs).toBeGreaterThanOrEqual(4);
        expect(result.stats.totalScenes).toBeGreaterThanOrEqual(2);
        expect(result.stats.dialogueFragments).toBeGreaterThanOrEqual(2);
        expect(result.stats.uniqueSpeakers.length).toBeGreaterThanOrEqual(1);

        // Validate scene break detection
        const breakReasons = result.scenes.map(s => s.breakReason);
        expect(breakReasons[0]).toBe('start');
    });

    it('handles single-line input', () => {
        const result = processText('Just one sentence here.');
        expect(result.paragraphs.length).toBe(1);
        expect(result.scenes.length).toBe(1);
    });
});
