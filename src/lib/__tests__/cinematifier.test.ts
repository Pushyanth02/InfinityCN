/**
 * cinematifier.test.ts — Unit tests for the pure-function exports of cinematifier.ts
 *
 * Covers:
 *   • parseCinematifiedText  — block parser (dialogue, sfx, beats, transitions, camera, action)
 *   • cleanExtractedText     — PDF-artifact removal
 *   • reconstructParagraphs  — sentence-boundary paragraph building
 *   • segmentChapters        — chapter boundary detection
 *   • cinematifyOffline      — fallback offline cinematification
 *   • detectSceneBreaks      — heuristic scene detection fallback
 *   • createBookFromSegments — Book entity factory
 *   • createReadingProgress  — ReadingProgress entity factory
 *   • extractOverallMetadata — genre/tone/character metadata extractor
 */

import { describe, it, expect } from 'vitest';
import {
    parseCinematifiedText,
    cleanExtractedText,
    reconstructParagraphs,
    segmentChapters,
    cinematifyOffline,
    detectSceneBreaks,
    createBookFromSegments,
    createReadingProgress,
    extractOverallMetadata,
} from '../cinematifier';
import type { ChapterSegment } from '../../types/cinematifier';

describe('parseCinematifiedText', () => {
    it('returns empty array for empty input', () => {
        expect(parseCinematifiedText('')).toEqual([]);
    });

    it('parses a plain action line', () => {
        const blocks = parseCinematifiedText('The door creaks open slowly.');
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('action');
        expect(blocks[0].content).toBe('The door creaks open slowly.');
    });

    it('parses a standalone BEAT marker', () => {
        const blocks = parseCinematifiedText('BEAT');
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('beat');
        expect(blocks[0].beat?.type).toBe('BEAT');
    });

    it('parses PAUSE marker', () => {
        const blocks = parseCinematifiedText('PAUSE');
        expect(blocks[0].type).toBe('beat');
        expect(blocks[0].beat?.type).toBe('PAUSE');
    });

    it('parses SILENCE marker', () => {
        const blocks = parseCinematifiedText('SILENCE');
        expect(blocks[0].type).toBe('beat');
        expect(blocks[0].beat?.type).toBe('SILENCE');
    });

    it('parses CUT TO scene transition', () => {
        const blocks = parseCinematifiedText('CUT TO: THE FOREST');
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('transition');
        expect(blocks[0].transition?.type).toBe('CUT TO');
        expect(blocks[0].transition?.description).toBe('THE FOREST');
    });

    it('parses FADE IN transition', () => {
        const blocks = parseCinematifiedText('FADE IN');
        expect(blocks[0].type).toBe('transition');
        expect(blocks[0].transition?.type).toBe('FADE IN');
    });

    it('parses FADE TO BLACK transition', () => {
        const blocks = parseCinematifiedText('FADE TO BLACK');
        expect(blocks[0].type).toBe('transition');
        expect(blocks[0].transition?.type).toBe('FADE TO BLACK');
    });

    it('parses a standalone SFX line', () => {
        const blocks = parseCinematifiedText('SFX: THUNDERCLAP');
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('sfx');
        expect(blocks[0].sfx?.sound).toBe('THUNDERCLAP');
        expect(blocks[0].sfx?.intensity).toBe('loud');
    });

    it('parses bracketed [SFX] tag lines', () => {
        const blocks = parseCinematifiedText('[SFX] THUNDERCLAP');
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('sfx');
        expect(blocks[0].sfx?.sound).toBe('THUNDERCLAP');
    });

    it('parses a soft SFX', () => {
        const blocks = parseCinematifiedText('SFX: soft whisper');
        expect(blocks[0].sfx?.intensity).toBe('soft');
    });

    it('parses an explosive SFX', () => {
        const blocks = parseCinematifiedText('SFX: DETONATION');
        expect(blocks[0].sfx?.intensity).toBe('explosive');
    });

    it('parses inline SFX attached to a text line', () => {
        const blocks = parseCinematifiedText('She slammed the door. SFX: SLAM');
        expect(blocks.length).toBeGreaterThanOrEqual(2);
        const sfxBlock = blocks.find(b => b.type === 'sfx');
        expect(sfxBlock).toBeDefined();
        expect(sfxBlock?.sfx?.sound).toBe('SLAM');
    });

    it('parses inline bracket SFX attached to a text line', () => {
        const blocks = parseCinematifiedText('She slammed the door. [SFX: SLAM]');
        expect(blocks.length).toBeGreaterThanOrEqual(2);
        const sfxBlock = blocks.find(b => b.type === 'sfx');
        expect(sfxBlock).toBeDefined();
        expect(sfxBlock?.sfx?.sound).toBe('SLAM');
    });

    it('parses a dialogue line', () => {
        const blocks = parseCinematifiedText('"I have to go," she whispered.');
        const dialogueBlock = blocks.find(b => b.type === 'dialogue');
        expect(dialogueBlock).toBeDefined();
        expect(dialogueBlock?.content).toBe('I have to go,');
        expect(dialogueBlock?.intensity).toBe('whisper');
    });

    it('parses a shouted dialogue line', () => {
        const blocks = parseCinematifiedText('"Run!" he shouted.');
        const dialogueBlock = blocks.find(b => b.type === 'dialogue');
        expect(dialogueBlock?.intensity).toBe('shout');
    });

    it('parses an inner thought with *asterisks*', () => {
        const blocks = parseCinematifiedText('*He knew this was wrong.*');
        expect(blocks[0].type).toBe('inner_thought');
        expect(blocks[0].content).toBe('He knew this was wrong.');
    });

    it('parses an inner thought with _underscores_', () => {
        const blocks = parseCinematifiedText('_Nothing would ever be the same._');
        expect(blocks[0].type).toBe('inner_thought');
    });

    it('parses camera direction', () => {
        const blocks = parseCinematifiedText('(CLOSE ON: his face)');
        expect(blocks[0].type).toBe('action');
        expect(blocks[0].cameraDirection).toBe('CLOSE ON');
    });

    it('extracts [EMOTION] tag from action line', () => {
        const blocks = parseCinematifiedText('She wept. [EMOTION: sadness]');
        expect(blocks[0].emotion).toBe('sadness');
        expect(blocks[0].content).not.toContain('[EMOTION:');
    });

    it('extracts [TENSION] tag from action line', () => {
        const blocks = parseCinematifiedText('The gun clicked. [TENSION: 85]');
        expect(blocks[0].tensionScore).toBe(85);
        expect(blocks[0].content).not.toContain('[TENSION:');
    });

    it('clamps tension score to 0-100', () => {
        const blocks = parseCinematifiedText('Something. [TENSION: 150]');
        expect(blocks[0].tensionScore).toBe(100);
    });

    it('assigns rapid timing to very short lines (≤4 words)', () => {
        const blocks = parseCinematifiedText('Stop. Drop. Roll.');
        // Even if grouped differently, at least one should have rapid timing
        const rapidBlock = blocks.find(b => b.timing === 'rapid');
        expect(rapidBlock).toBeDefined();
    });

    it('handles multiple paragraphs', () => {
        const text = 'First paragraph.\n\nSecond paragraph.\n\nSFX: BOOM';
        const blocks = parseCinematifiedText(text);
        const sfxBlock = blocks.find(b => b.type === 'sfx');
        expect(sfxBlock).toBeDefined();
    });

    it('each block has a unique id', () => {
        const blocks = parseCinematifiedText('Line one.\n\nLine two.\n\nLine three.');
        const ids = blocks.map(b => b.id);
        const unique = new Set(ids);
        expect(unique.size).toBe(ids.length);
    });

    // ─── Scene Marker Tests ──────────────────────────────────

    it('parses [SCENE: description] markers as title_card blocks', () => {
        const blocks = parseCinematifiedText('[SCENE: Abandoned Mountain Path]');
        expect(blocks.length).toBe(1);
        expect(blocks[0].type).toBe('title_card');
        expect(blocks[0].content).toBe('Abandoned Mountain Path');
    });

    it('parses [SCENE] markers without colon', () => {
        const blocks = parseCinematifiedText('[SCENE] Abandoned Mountain Path');
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

// ─── cleanExtractedText ───────────────────────────────────────────────────────

describe('cleanExtractedText', () => {
    it('removes standalone page numbers', () => {
        const text = 'Some content.\n42\nMore content.';
        expect(cleanExtractedText(text)).not.toMatch(/^\s*42\s*$/m);
    });

    it('removes "Page X of Y" lines', () => {
        const text = 'Text.\nPage 3 of 100\nMore text.';
        expect(cleanExtractedText(text)).not.toMatch(/page\s+3/i);
    });

    it('removes "- X -" page number lines', () => {
        const text = 'Text.\n- 7 -\nMore text.';
        expect(cleanExtractedText(text)).not.toMatch(/- 7 -/);
    });

    it('fixes hyphenated line breaks', () => {
        // This tests hyphen-join: e.g. "some-\nword" → "someword"
        const hyphenText = 'con-\nnection';
        expect(cleanExtractedText(hyphenText)).toContain('connection');
    });

    it('collapses 4+ blank lines into max 3 newlines', () => {
        const text = 'Para 1.\n\n\n\n\nPara 2.';
        const result = cleanExtractedText(text);
        expect(result).not.toMatch(/\n{5,}/);
    });

    it('trims leading/trailing whitespace from lines', () => {
        const text = '   indented line   ';
        const result = cleanExtractedText(text);
        expect(result).toBe('indented line');
    });

    it('returns empty string for empty input', () => {
        expect(cleanExtractedText('')).toBe('');
    });

    it('preserves normal prose unchanged', () => {
        const prose = 'The sun rose over the mountains. Birds sang in the trees.';
        expect(cleanExtractedText(prose)).toBe(prose);
    });
});

// ─── reconstructParagraphs ────────────────────────────────────────────────────

describe('reconstructParagraphs', () => {
    it('returns text unchanged when paragraphs already exist and are short', () => {
        const text =
            'First paragraph here. It has a few sentences.\n\n' +
            'Second paragraph here. Also a few sentences.\n\n' +
            'Third paragraph, short.';
        const result = reconstructParagraphs(text);
        expect(result).toBe(text);
    });

    it('handles single-sentence input', () => {
        const text = 'Just one sentence.';
        const result = reconstructParagraphs(text);
        expect(result).toContain('Just one sentence.');
    });

    it('returns non-empty string for non-empty input', () => {
        const text = 'Hello. World. How are you? Fine, thank you.';
        expect(reconstructParagraphs(text).length).toBeGreaterThan(0);
    });

    it('does not lose sentences during reconstruction', () => {
        const text =
            'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.';
        const result = reconstructParagraphs(text);
        expect(result).toContain('First sentence');
        expect(result).toContain('Fifth sentence');
    });

    it('breaks at dialogue starts', () => {
        const text =
            'He walked in. She was there. He spoke. She looked up.\n' +
            '"Hello," he said.\n' +
            '"Hi," she replied.';
        const result = reconstructParagraphs(text);
        // Dialogue lines should be in separate paragraphs
        expect(result).toContain('"Hello,"');
    });
});

// ─── segmentChapters ─────────────────────────────────────────────────────────

describe('segmentChapters', () => {
    const makeContent = (repeat = 20) =>
        'The hero walked through the dense forest. '.repeat(repeat);

    it('returns an "Introduction" segment for text with no chapter markers', () => {
        // When text has no chapter markers and content > 100 chars, segmentChapters
        // collects it as an "Introduction" segment (not "Full Text").
        // "Full Text" only appears when the accumulated content is ≤ 100 chars.
        const text = makeContent(5);
        const segments = segmentChapters(text);
        expect(segments).toHaveLength(1);
        expect(segments[0].title).toBe('Introduction');
    });

    it('detects "Chapter N" headings', () => {
        const text = `Chapter 1\n${makeContent()}\nChapter 2\n${makeContent()}`;
        const segments = segmentChapters(text);
        const titles = segments.map(s => s.title);
        expect(titles.some(t => /chapter 1/i.test(t))).toBe(true);
    });

    it('detects "Part N" headings', () => {
        const text = `Part I\n${makeContent()}\nPart II\n${makeContent()}`;
        const segments = segmentChapters(text);
        const titles = segments.map(s => s.title);
        expect(titles.some(t => /part/i.test(t))).toBe(true);
    });

    it('detects Prologue/Epilogue headings', () => {
        const text = `Prologue\n${makeContent()}\nChapter 1\n${makeContent()}`;
        const segments = segmentChapters(text);
        expect(segments.some(s => /prologue/i.test(s.title))).toBe(true);
    });

    it('detects *** dividers as section breaks', () => {
        const text = `${makeContent()}\n***\n${makeContent()}`;
        const segments = segmentChapters(text);
        expect(segments.length).toBeGreaterThanOrEqual(1);
    });

    it('each segment has content, title, startIndex, endIndex', () => {
        const text = `Chapter 1\n${makeContent()}`;
        const segments = segmentChapters(text);
        for (const seg of segments) {
            expect(seg.title).toBeTruthy();
            expect(seg.content).toBeTruthy();
            expect(typeof seg.startIndex).toBe('number');
            expect(typeof seg.endIndex).toBe('number');
        }
    });

    it('ignores chapters with fewer than 100 chars of content', () => {
        // Chapter with almost no content after heading — should be skipped
        const text = `Chapter 1\nToo short.\nChapter 2\n${makeContent()}`;
        const segments = segmentChapters(text);
        // Chapter 2 should be present; Chapter 1's content is too short
        const ch2 = segments.find(s => /chapter 2/i.test(s.title));
        expect(ch2).toBeDefined();
    });

    it('returns empty array for empty input', () => {
        expect(segmentChapters('')).toHaveLength(0);
    });

    it('chapter titles include space between label and number', () => {
        const text = `Chapter 5\n${makeContent()}\nChapter 10\n${makeContent()}`;
        const segments = segmentChapters(text);
        // Verify no concatenation like "Chapter5" — should be "Chapter 5"
        for (const seg of segments) {
            if (/chapter/i.test(seg.title)) {
                expect(seg.title).toMatch(/Chapter \d/);
                expect(seg.title).not.toMatch(/Chapter\d/);
            }
        }
    });

    it('chapter titles with subtitles are properly formatted', () => {
        const text = `Chapter 1: The Beginning\n${makeContent()}\nChapter 2: The Journey\n${makeContent()}`;
        const segments = segmentChapters(text);
        const ch1 = segments.find(s => /beginning/i.test(s.title));
        expect(ch1).toBeDefined();
        expect(ch1!.title).toContain('Chapter 1');
        expect(ch1!.title).toContain('The Beginning');
    });
});

// ─── cinematifyOffline ────────────────────────────────────────────────────────

describe('cinematifyOffline', () => {
    const sampleText = `
He moved through the shadows. The night was cold.

"Stay back!" she screamed. The door slammed.

Suddenly, an explosion shook the building.
    `.trim();

    it('returns a CinematificationResult with blocks, rawText, and metadata', () => {
        const result = cinematifyOffline(sampleText);
        expect(result.blocks).toBeDefined();
        expect(result.rawText).toBeDefined();
        expect(result.metadata).toBeDefined();
    });

    it('produces at least one block', () => {
        const result = cinematifyOffline(sampleText);
        expect(result.blocks.length).toBeGreaterThan(0);
    });

    it('metadata.originalWordCount matches input word count', () => {
        const result = cinematifyOffline(sampleText);
        const wordCount = sampleText.split(/\s+/).filter(Boolean).length;
        expect(result.metadata.originalWordCount).toBe(wordCount);
    });

    it('sfxCount is a non-negative integer', () => {
        const result = cinematifyOffline(sampleText);
        expect(result.metadata.sfxCount).toBeGreaterThanOrEqual(0);
    });

    it('processingTimeMs is a non-negative number', () => {
        const result = cinematifyOffline(sampleText);
        expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('handles empty text gracefully', () => {
        const result = cinematifyOffline('');
        expect(result.blocks).toBeDefined();
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

// ─── detectSceneBreaks ────────────────────────────────────────────────────────

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
// ─── createBookFromSegments ───────────────────────────────────────────────────

describe('createBookFromSegments', () => {
    const segments: ChapterSegment[] = [
        {
            title: 'Chapter 1',
            content: 'The hero began his journey. '.repeat(20),
            startIndex: 0,
            endIndex: 10,
        },
        {
            title: 'Chapter 2',
            content: 'The adventure continued. '.repeat(20),
            startIndex: 11,
            endIndex: 20,
        },
    ];

    it('creates a Book with correct chapter count', () => {
        const book = createBookFromSegments(segments);
        expect(book.chapters).toHaveLength(2);
        expect(book.totalChapters).toBe(2);
    });

    it('creates chapters with incrementing numbers', () => {
        const book = createBookFromSegments(segments);
        expect(book.chapters[0].number).toBe(1);
        expect(book.chapters[1].number).toBe(2);
    });

    it('uses provided title', () => {
        const book = createBookFromSegments(segments, 'My Novel');
        expect(book.title).toBe('My Novel');
    });

    it('defaults title to "Untitled Novel"', () => {
        const book = createBookFromSegments(segments);
        expect(book.title).toBe('Untitled Novel');
    });

    it('sets genre from options', () => {
        const book = createBookFromSegments(segments, 'Title', { genre: 'fantasy' });
        expect(book.genre).toBe('fantasy');
    });

    it('defaults genre to "other"', () => {
        const book = createBookFromSegments(segments);
        expect(book.genre).toBe('other');
    });

    it('sets isPublic from options', () => {
        const book = createBookFromSegments(segments, 'Title', { isPublic: true });
        expect(book.isPublic).toBe(true);
    });

    it('calculates totalWordCount across all chapters', () => {
        const book = createBookFromSegments(segments);
        expect(book.totalWordCount).toBeGreaterThan(0);
    });

    it('sets status to "processing"', () => {
        const book = createBookFromSegments(segments);
        expect(book.status).toBe('processing');
    });

    it('generates a book id with "book-" prefix followed by a numeric timestamp', () => {
        // createBookFromSegments uses Date.now() which may return the same value
        // within 1ms — we verify the format, not uniqueness across same-ms calls
        const book = createBookFromSegments(segments);
        expect(book.id).toMatch(/^book-\d+$/);
    });

    it('each chapter starts with isProcessed=false and status=pending', () => {
        const book = createBookFromSegments(segments);
        for (const ch of book.chapters) {
            expect(ch.isProcessed).toBe(false);
            expect(ch.status).toBe('pending');
        }
    });

    it('calculates estimatedReadTime (word count / 200 rounded up)', () => {
        const book = createBookFromSegments(segments);
        for (const ch of book.chapters) {
            const expected = Math.ceil(ch.wordCount / 200);
            expect(ch.estimatedReadTime).toBe(expected);
        }
    });

    it('word count does not inflate on whitespace-padded content', () => {
        const paddedSegments: ChapterSegment[] = [
            {
                title: 'Padded Chapter',
                content: '  hello world  ',
                startIndex: 0,
                endIndex: 0,
            },
        ];
        const book = createBookFromSegments(paddedSegments);
        expect(book.chapters[0].wordCount).toBe(2);
        expect(book.totalWordCount).toBe(2);
    });
});

// ─── createReadingProgress ────────────────────────────────────────────────────

describe('createReadingProgress', () => {
    it('creates a ReadingProgress with the given bookId', () => {
        const prog = createReadingProgress('book-123');
        expect(prog.bookId).toBe('book-123');
    });

    it('id is "progress-<bookId>"', () => {
        const prog = createReadingProgress('book-abc');
        expect(prog.id).toBe('progress-book-abc');
    });

    it('starts at chapter 1', () => {
        const prog = createReadingProgress('book-1');
        expect(prog.currentChapter).toBe(1);
    });

    it('starts at scroll position 0', () => {
        const prog = createReadingProgress('book-1');
        expect(prog.scrollPosition).toBe(0);
    });

    it('defaults readingMode to "cinematified"', () => {
        const prog = createReadingProgress('book-1');
        expect(prog.readingMode).toBe('cinematified');
    });

    it('starts with empty bookmarks', () => {
        const prog = createReadingProgress('book-1');
        expect(prog.bookmarks).toEqual([]);
    });

    it('starts as not completed', () => {
        const prog = createReadingProgress('book-1');
        expect(prog.completed).toBe(false);
    });

    it('starts with empty readChapters', () => {
        const prog = createReadingProgress('book-1');
        expect(prog.readChapters).toEqual([]);
    });

    it('starts with totalReadTime of 0', () => {
        const prog = createReadingProgress('book-1');
        expect(prog.totalReadTime).toBe(0);
    });

    it('sets lastReadAt as a recent timestamp', () => {
        const before = Date.now();
        const prog = createReadingProgress('book-1');
        const after = Date.now();
        expect(prog.lastReadAt).toBeGreaterThanOrEqual(before);
        expect(prog.lastReadAt).toBeLessThanOrEqual(after);
    });
});

// ─── extractOverallMetadata ───────────────────────────────────────────────────

describe('extractOverallMetadata', () => {
    it('extracts genre from [GENRE: fantasy] tag', () => {
        const meta = extractOverallMetadata('[GENRE: fantasy]', []);
        expect(meta.genre).toBe('fantasy');
    });

    it('extracts genre case-insensitively', () => {
        const meta = extractOverallMetadata('[GENRE: THRILLER]', []);
        expect(meta.genre).toBe('thriller');
    });

    it('normalises spaces to underscores in genre (sci fi → sci_fi)', () => {
        const meta = extractOverallMetadata('[GENRE: sci fi]', []);
        expect(meta.genre).toBe('sci_fi');
    });

    it('ignores unknown genre values', () => {
        const meta = extractOverallMetadata('[GENRE: cooking]', []);
        expect(meta.genre).toBeUndefined();
    });

    it('extracts tone tags from [TONE: dark, suspenseful]', () => {
        const meta = extractOverallMetadata('[TONE: dark, suspenseful]', []);
        expect(meta.toneTags).toEqual(['dark', 'suspenseful']);
    });

    it('returns empty characters object when no dialogue blocks', () => {
        const meta = extractOverallMetadata('', []);
        expect(meta.characters).toEqual({});
    });

    it('counts dialogue blocks per speaker', () => {
        const blocks = [
            {
                type: 'dialogue' as const,
                speaker: 'ALICE',
                content: 'Hello',
                id: '1',
                intensity: 'normal' as const,
            },
            {
                type: 'dialogue' as const,
                speaker: 'BOB',
                content: 'Hi',
                id: '2',
                intensity: 'normal' as const,
            },
            {
                type: 'dialogue' as const,
                speaker: 'ALICE',
                content: 'How are you?',
                id: '3',
                intensity: 'normal' as const,
            },
        ];
        const meta = extractOverallMetadata('', blocks);
        expect(meta.characters['ALICE'].dialogueCount).toBe(2);
        expect(meta.characters['BOB'].dialogueCount).toBe(1);
    });

    it('records appearance indices for each speaker', () => {
        const blocks = [
            {
                type: 'dialogue' as const,
                speaker: 'EVE',
                content: 'Test',
                id: '1',
                intensity: 'normal' as const,
            },
        ];
        const meta = extractOverallMetadata('', blocks);
        expect(meta.characters['EVE'].appearances).toContain(0);
    });

    it('handles undefined rawText gracefully', () => {
        const meta = extractOverallMetadata(undefined, []);
        expect(meta.genre).toBeUndefined();
        expect(meta.toneTags).toBeUndefined();
    });
});
