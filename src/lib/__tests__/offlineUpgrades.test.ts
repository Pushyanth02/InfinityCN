/**
 * offlineUpgrades.test.ts — Tests for upgraded offline algorithms
 *
 * Covers new features across:
 *   • offlineEngine.ts  — cinematifyOffline title cards, inner thoughts, SFX, transitions, pacing
 *   • textProcessing.ts — normalizeQuotes, normalizeUnicode, cleanExtractedText
 *   • sceneDetection.ts — detectPOVShift, detectNarrativeMode, detectSceneBreaks
 *   • chapterSegmentation.ts — segmentChapters for Act/Scene/Section/ALL-CAPS headings
 *   • textStatistics.ts — computeTextStatistics new metrics (dialogue, thoughts, action, vocabulary)
 */

import { describe, it, expect } from 'vitest';
import {
    cinematifyOffline,
    normalizeQuotes,
    normalizeUnicode,
    cleanExtractedText,
    detectPOVShift,
    detectNarrativeMode,
    detectSceneBreaks,
    deriveSceneTitle,
    segmentChapters,
} from '../cinematifier';
import { computeTextStatistics } from '../textStatistics';

// ─── Helpers ───────────────────────────────────────────────

/** Generate filler content of at least `minLength` characters. */
function makeContent(repeat: number): string {
    const base =
        'The wind howled through the ancient corridors of the stone castle. ' +
        'Shadows danced along the walls as the candles flickered in the draft. ';
    return base.repeat(repeat);
}

// ─── 1. offlineEngine.ts — cinematifyOffline ───────────────

describe('cinematifyOffline', () => {
    describe('title_card detection', () => {
        it('detects "Act I" heading as a title_card block', () => {
            const result = cinematifyOffline('Act I');
            const titleCards = result.blocks.filter(b => b.type === 'title_card');
            expect(titleCards.length).toBeGreaterThanOrEqual(1);
            expect(titleCards[0].content).toMatch(/ACT I/i);
        });

        it('detects "Scene 3" heading as a title_card block', () => {
            const result = cinematifyOffline('Scene 3');
            const titleCards = result.blocks.filter(b => b.type === 'title_card');
            expect(titleCards.length).toBeGreaterThanOrEqual(1);
            expect(titleCards[0].content).toMatch(/SCENE 3/i);
        });

        it('detects ALL-CAPS title "THE BEGINNING" as a title_card block', () => {
            const result = cinematifyOffline('THE BEGINNING');
            const titleCards = result.blocks.filter(b => b.type === 'title_card');
            expect(titleCards.length).toBeGreaterThanOrEqual(1);
            expect(titleCards[0].content).toBe('THE BEGINNING');
        });

        it('detects standalone Roman numeral "III" as a title_card block', () => {
            const result = cinematifyOffline('III');
            const titleCards = result.blocks.filter(b => b.type === 'title_card');
            expect(titleCards.length).toBeGreaterThanOrEqual(1);
            expect(titleCards[0].content).toBe('III');
        });
    });

    describe('inner_thought detection', () => {
        it('detects *asterisk-wrapped* text as inner_thought block', () => {
            const result = cinematifyOffline('*She could never go back now*');
            const thoughts = result.blocks.filter(b => b.type === 'inner_thought');
            expect(thoughts.length).toBeGreaterThanOrEqual(1);
            expect(thoughts[0].content).toBe('She could never go back now');
        });

        it('detects _underscore-wrapped_ text as inner_thought block', () => {
            const result = cinematifyOffline('_What have I done_');
            const thoughts = result.blocks.filter(b => b.type === 'inner_thought');
            expect(thoughts.length).toBeGreaterThanOrEqual(1);
            expect(thoughts[0].content).toBe('What have I done');
        });

        it('detects introspective patterns ("She wondered if...") as inner_thought block', () => {
            const result = cinematifyOffline('She wondered if the choice had been right');
            const thoughts = result.blocks.filter(b => b.type === 'inner_thought');
            expect(thoughts.length).toBeGreaterThanOrEqual(1);
            expect(thoughts[0].content).toContain('She wondered');
        });
    });

    describe('character tracking across paragraphs', () => {
        it('tracks character names so later dialogue near them gets attributed', () => {
            const text = [
                'Sarah said "Hello there."',
                '',
                'Sarah walked to the window. "I need to leave."',
            ].join('\n');
            const result = cinematifyOffline(text);
            const dialogueBlocks = result.blocks.filter(b => b.type === 'dialogue');
            // At least one dialogue block should be attributed to SARAH
            const attributed = dialogueBlocks.filter(b => b.speaker === 'SARAH');
            expect(attributed.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('SFX trigger detection', () => {
        it('detects "splash" as SFX', () => {
            const result = cinematifyOffline('There was a loud splash in the water.');
            const sfx = result.blocks.filter(b => b.type === 'sfx');
            expect(sfx.length).toBeGreaterThanOrEqual(1);
            expect(sfx[0].sfx?.sound).toBe('SPLASH');
        });

        it('detects "clang" as SFX', () => {
            const result = cinematifyOffline('The metal gate hit with a clang.');
            const sfx = result.blocks.filter(b => b.type === 'sfx');
            expect(sfx.length).toBeGreaterThanOrEqual(1);
            expect(sfx[0].sfx?.sound).toBe('CLANG');
        });

        it('detects "buzz" as SFX', () => {
            const result = cinematifyOffline('The phone started to buzz on the table.');
            const sfx = result.blocks.filter(b => b.type === 'sfx');
            expect(sfx.length).toBeGreaterThanOrEqual(1);
            expect(sfx[0].sfx?.sound).toBe('BUZZ');
        });
    });

    describe('transition detection', () => {
        it('detects INT./EXT. lines as transitions', () => {
            const result = cinematifyOffline('INT. OFFICE - NIGHT');
            const transitions = result.blocks.filter(b => b.type === 'transition');
            expect(transitions.length).toBeGreaterThanOrEqual(1);
        });

        it('detects FLASHBACK markers as transitions', () => {
            const result = cinematifyOffline('FLASHBACK');
            const transitions = result.blocks.filter(b => b.type === 'transition');
            expect(transitions.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('pacing and intensity analysis', () => {
        it('handles question-heavy paragraphs with suspense', () => {
            const text = 'Is it safe now? Does anyone know? Can we finally leave this place?';
            const result = cinematifyOffline(text);
            const actionBlocks = result.blocks.filter(b => b.type === 'action');
            expect(actionBlocks.length).toBeGreaterThanOrEqual(1);
            expect(actionBlocks[0].emotion).toBe('suspense');
        });

        it('handles staccato sentences with rapid timing', () => {
            const text = 'He ran. She fell. They froze. It broke.';
            const result = cinematifyOffline(text);
            const actionBlocks = result.blocks.filter(b => b.type === 'action');
            expect(actionBlocks.length).toBeGreaterThanOrEqual(1);
            expect(actionBlocks[0].timing).toBe('rapid');
        });

        it('handles long flowing sentences with slow timing', () => {
            const text =
                'The river wound its way through the ancient valley where the trees ' +
                'stood tall and proud against the fading light of the evening sun as it ' +
                'dipped below the horizon painting the sky in shades of amber and rose ' +
                'and the birds sang their final songs of the day.';
            const result = cinematifyOffline(text);
            const actionBlocks = result.blocks.filter(b => b.type === 'action');
            expect(actionBlocks.length).toBeGreaterThanOrEqual(1);
            expect(actionBlocks[0].timing).toBe('slow');
        });
    });
});

// ─── 2. textProcessing.ts — normalizeQuotes ────────────────

describe('normalizeQuotes', () => {
    it('converts curly double quotes to straight', () => {
        expect(normalizeQuotes('\u201CHello\u201D')).toBe('"Hello"');
    });

    it('converts curly single quotes to straight', () => {
        expect(normalizeQuotes('\u2018it\u2019s')).toBe("'it's");
    });

    it('normalizes en-dash and em-dash', () => {
        const result = normalizeQuotes('A\u2013B\u2014C');
        expect(result).toBe('A\u2014B\u2014C');
    });

    it('normalizes ellipsis character to three dots', () => {
        expect(normalizeQuotes('Wait\u2026')).toBe('Wait...');
    });
});

// ─── 2. textProcessing.ts — normalizeUnicode ───────────────

describe('normalizeUnicode', () => {
    it('converts ligatures (ﬁ→fi, ﬂ→fl)', () => {
        expect(normalizeUnicode('\uFB01nd')).toBe('find');
        expect(normalizeUnicode('\uFB02ow')).toBe('flow');
    });

    it('strips zero-width characters', () => {
        expect(normalizeUnicode('he\u200Bllo')).toBe('hello');
        expect(normalizeUnicode('wo\uFEFFrld')).toBe('world');
    });

    it('applies NFC normalization', () => {
        // é as e + combining acute (NFD) should become single codepoint (NFC)
        const nfd = 'e\u0301';
        const result = normalizeUnicode(nfd);
        expect(result).toBe('\u00E9');
    });
});

// ─── 2. textProcessing.ts — cleanExtractedText ─────────────

describe('cleanExtractedText', () => {
    it('removes OCR noise (standalone |, §, ¶)', () => {
        const text = 'Hello world.\n|\n§\n¶\nGoodbye.';
        const cleaned = cleanExtractedText(text);
        expect(cleaned).not.toMatch(/^\s*[|§¶]\s*$/m);
        expect(cleaned).toContain('Hello world.');
        expect(cleaned).toContain('Goodbye.');
    });

    it('removes repeated character lines (=====, _____)', () => {
        const text = 'Title\n=====\nContent here.\n_____\nMore content.';
        const cleaned = cleanExtractedText(text);
        expect(cleaned).not.toContain('=====');
        expect(cleaned).not.toContain('_____');
        expect(cleaned).toContain('Title');
        expect(cleaned).toContain('Content here.');
    });

    it('normalizes quotes in the process', () => {
        const text = '\u201CHello,\u201D she said.';
        const cleaned = cleanExtractedText(text);
        expect(cleaned).toContain('"Hello,"');
    });
});

// ─── 3. sceneDetection.ts — detectPOVShift ─────────────────

describe('detectPOVShift', () => {
    it('returns character name when paragraph starts with "Name walked..."', () => {
        const result = detectPOVShift(['Marcus walked down the corridor.']);
        expect(result).toBe('Marcus');
    });

    it('returns undefined when no character pattern', () => {
        const result = detectPOVShift(['The wind blew through the trees.']);
        expect(result).toBeUndefined();
    });

    it('returns undefined for empty array', () => {
        const result = detectPOVShift([]);
        expect(result).toBeUndefined();
    });
});

// ─── 3. sceneDetection.ts — detectNarrativeMode ────────────

describe('detectNarrativeMode', () => {
    it('returns "flashback" for "He remembered the old days"', () => {
        expect(detectNarrativeMode('He remembered the old days')).toBe('flashback');
    });

    it('returns "dream" for "In the dream, she was flying"', () => {
        expect(detectNarrativeMode('In the dream, she was flying')).toBe('dream');
    });

    it('returns "memory" for "The memory faded slowly"', () => {
        expect(detectNarrativeMode('The memory faded slowly')).toBe('memory');
    });

    it('returns "normal" for regular text', () => {
        expect(detectNarrativeMode('She walked to the store.')).toBe('normal');
    });
});

// ─── 3. sceneDetection.ts — detectSceneBreaks ──────────────

describe('detectSceneBreaks', () => {
    it('detects "moments later" as scene break', () => {
        const paragraphs = ['First scene content here.', 'Moments later, the door opened.'];
        const scenes = detectSceneBreaks(paragraphs);
        expect(scenes.length).toBe(2);
    });

    it('detects "without warning" as scene break', () => {
        const paragraphs = ['Everything was calm.', 'Without warning, the glass shattered.'];
        const scenes = detectSceneBreaks(paragraphs);
        expect(scenes.length).toBe(2);
    });

    it('detects "at nightfall" as scene break', () => {
        const paragraphs = ['The travelers marched on.', 'At nightfall, they made camp.'];
        const scenes = detectSceneBreaks(paragraphs);
        expect(scenes.length).toBe(2);
    });
});

// ─── 4. chapterSegmentation.ts — segmentChapters ───────────

describe('segmentChapters', () => {
    it('detects "Act I" headings', () => {
        const text = 'Act I\n' + makeContent(2);
        const segments = segmentChapters(text);
        expect(segments.some(s => /act\s+i/i.test(s.title))).toBe(true);
    });

    it('detects "Scene 1" headings', () => {
        const text = 'Scene 1\n' + makeContent(2);
        const segments = segmentChapters(text);
        expect(segments.some(s => /scene\s+1/i.test(s.title))).toBe(true);
    });

    it('detects "Section 1" headings', () => {
        const text = 'Section 1\n' + makeContent(2);
        const segments = segmentChapters(text);
        expect(segments.some(s => /section\s+1/i.test(s.title))).toBe(true);
    });

    it('detects ALL-CAPS titles like "THE AWAKENING"', () => {
        const text = 'THE AWAKENING\n' + makeContent(2);
        const segments = segmentChapters(text);
        expect(segments.some(s => /THE AWAKENING/i.test(s.title))).toBe(true);
    });
});

// ─── 5. textStatistics.ts — computeTextStatistics ──────────

describe('computeTextStatistics — new metrics', () => {
    it('returns dialoguePercentage for text with dialogue', () => {
        const text = 'He said "Hello friend" to her. She nodded quietly.';
        const stats = computeTextStatistics(text);
        expect(stats.dialoguePercentage).toBeGreaterThan(0);
    });

    it('returns innerThoughtRatio for text with *thoughts*', () => {
        const text = 'She paused. *What am I doing here* she asked herself.';
        const stats = computeTextStatistics(text);
        expect(stats.innerThoughtRatio).toBeGreaterThan(0);
    });

    it('returns actionDensity = 100 - dialogue - thoughts', () => {
        const text = 'He said "Hello friend" to her. *Am I dreaming* she thought. The sun set.';
        const stats = computeTextStatistics(text);
        const expected = Math.max(
            0,
            Math.min(
                100,
                Math.round((100 - stats.dialoguePercentage - stats.innerThoughtRatio) * 10) / 10,
            ),
        );
        expect(stats.actionDensity).toBe(expected);
    });

    it('returns vocabularyRichness between 0 and 1', () => {
        const text = 'The cat sat on the mat. The cat was happy.';
        const stats = computeTextStatistics(text);
        expect(stats.vocabularyRichness).toBeGreaterThan(0);
        expect(stats.vocabularyRichness).toBeLessThanOrEqual(1);
    });

    it('all new metrics are 0 for empty text', () => {
        const stats = computeTextStatistics('');
        expect(stats.dialoguePercentage).toBe(0);
        expect(stats.innerThoughtRatio).toBe(0);
        expect(stats.actionDensity).toBe(0);
        expect(stats.vocabularyRichness).toBe(0);
    });
});

// ─── Pipeline Stages ──────────────────────────────────────────────

import type { PipelineContext } from '../cinematifier/pipeline';

describe('NarrativeAnalysisStage', () => {
    it('detects POV character in pipeline context', async () => {
        const { NarrativeAnalysisStage } = await import('../cinematifier/pipeline');
        const stage = new NarrativeAnalysisStage();
        const context: PipelineContext = {
            text: 'Sarah walked slowly through the mist.\n\nThe night was cold.',
            blocks: [],
            rawText: '',
            metadata: { sfxCount: 0, transitionCount: 0, beatCount: 0, originalWordCount: 0 },
            startTime: performance.now(),
        };
        stage.execute(context);
        expect(context.povCharacter).toBe('Sarah');
    });

    it('detects flashback narrative mode', async () => {
        const { NarrativeAnalysisStage } = await import('../cinematifier/pipeline');
        const stage = new NarrativeAnalysisStage();
        const context: PipelineContext = {
            text: 'She remembered when life was simpler.\n\nThose days were gone.',
            blocks: [],
            rawText: '',
            metadata: { sfxCount: 0, transitionCount: 0, beatCount: 0, originalWordCount: 0 },
            startTime: performance.now(),
        };
        stage.execute(context);
        expect(context.narrativeMode).toBe('flashback');
    });

    it('defaults to normal narrative mode', async () => {
        const { NarrativeAnalysisStage } = await import('../cinematifier/pipeline');
        const stage = new NarrativeAnalysisStage();
        const context: PipelineContext = {
            text: 'The sun was shining brightly.\n\nBirds chirped in the trees.',
            blocks: [],
            rawText: '',
            metadata: { sfxCount: 0, transitionCount: 0, beatCount: 0, originalWordCount: 0 },
            startTime: performance.now(),
        };
        stage.execute(context);
        expect(context.narrativeMode).toBe('normal');
    });
});

describe('SceneSegmentationStage', () => {
    it('segments text into scenes with titles', async () => {
        const { SceneSegmentationStage } = await import('../cinematifier/pipeline');
        const stage = new SceneSegmentationStage();
        const context: PipelineContext = {
            text: 'The village was quiet.\n\nSuddenly the ground shook.',
            blocks: [],
            rawText: '',
            metadata: { sfxCount: 0, transitionCount: 0, beatCount: 0, originalWordCount: 0 },
            startTime: performance.now(),
        };
        stage.execute(context);
        expect(context.scenes).toBeDefined();
        expect(context.scenes!.length).toBeGreaterThanOrEqual(1);
        expect(context.scenes![0].title).toBeDefined();
        expect(context.scenes![0].paragraphs.length).toBeGreaterThan(0);
    });

    it('creates multiple scenes at break signals', async () => {
        const { SceneSegmentationStage } = await import('../cinematifier/pipeline');
        const stage = new SceneSegmentationStage();
        const context: PipelineContext = {
            text: 'He arrived at the gate.\n\nHours later he was inside.',
            blocks: [],
            rawText: '',
            metadata: { sfxCount: 0, transitionCount: 0, beatCount: 0, originalWordCount: 0 },
            startTime: performance.now(),
        };
        stage.execute(context);
        expect(context.scenes!.length).toBe(2);
    });
});

describe('Enriched offline pipeline', () => {
    it('includes NarrativeAnalysis and SceneSegmentation stages', async () => {
        const { CinematificationPipeline } = await import('../cinematifier/pipeline');
        const pipeline = CinematificationPipeline.createEnrichedOfflinePipeline();
        const names = pipeline.getStageNames();
        expect(names).toContain('Narrative Analysis');
        expect(names).toContain('Scene Segmentation');
    });

    it('produces narrativeMode and scenes in result', async () => {
        const { CinematificationPipeline } = await import('../cinematifier/pipeline');
        const pipeline = CinematificationPipeline.createEnrichedOfflinePipeline();
        const result = await pipeline.execute(
            'Sarah walked slowly through the dark forest.\n\nSuddenly the trees parted.',
        );
        expect(result.narrativeMode).toBeDefined();
        expect(result.scenes).toBeDefined();
        expect(result.scenes!.length).toBeGreaterThanOrEqual(1);
    });
});

describe('deriveSceneTitle mood-based titles', () => {
    it('generates mood-prefixed title for dark content', () => {
        const title = deriveSceneTitle(['The shadow crept closer, filled with dread.'], 1);
        expect(title).toBe('Dark Scene 1');
    });

    it('generates mood-prefixed title for joyful content', () => {
        const title = deriveSceneTitle(['Everyone began to laugh and celebrate.'], 2);
        expect(title).toBe('Joyful Scene 2');
    });

    it('falls back to generic title when no mood matches', () => {
        const title = deriveSceneTitle(['She walked along the road.'], 3);
        expect(title).toBe('Scene 3');
    });

    it('prefers location over mood when location is present', () => {
        const title = deriveSceneTitle(['They arrived at Castle Rock with dread.'], 1);
        expect(title).toBe('Castle Rock');
    });
});
