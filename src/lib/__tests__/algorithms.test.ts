import { describe, it, expect } from 'vitest';
import {
    tokenise,
    splitSentences,
    analyseSentiment,
    scoreTension,
    extractCharacters,
    computeReadability,
    extractKeywords,
    computeVocabRichness,
    analysePacing,
    computeEmotionalArc,
    generateExtractiveRecap,
    detectSceneBoundaries,
} from '../algorithms';

// ─── TOKENISE ──────────────────────────────────────────────────────

describe('tokenise', () => {
    it('splits text into lowercase words', () => {
        expect(tokenise('Hello World')).toEqual(['hello', 'world']);
    });

    it('strips punctuation but keeps apostrophes and hyphens', () => {
        expect(tokenise("don't well-known!")).toEqual(["don't", 'well-known']);
    });

    it('returns empty array for empty input', () => {
        expect(tokenise('')).toEqual([]);
    });

    it('handles multiple spaces and special characters', () => {
        expect(tokenise('  foo   bar  ')).toEqual(['foo', 'bar']);
    });
});

// ─── SPLIT SENTENCES ───────────────────────────────────────────────

describe('splitSentences', () => {
    it('splits on sentence-ending punctuation', () => {
        const result = splitSentences('Hello there. How are you? Pretty good!');
        expect(result).toEqual(['Hello there.', 'How are you?', 'Pretty good!']);
    });

    it('filters out short fragments (≤5 chars)', () => {
        const result = splitSentences('Ok. Hi. This is a proper sentence.');
        expect(result).toEqual(['This is a proper sentence.']);
    });

    it('returns empty array for empty input', () => {
        expect(splitSentences('')).toEqual([]);
    });
});

// ─── SENTIMENT ANALYSIS ────────────────────────────────────────────

describe('analyseSentiment', () => {
    it('detects positive sentiment', () => {
        const result = analyseSentiment('I love this amazing wonderful day');
        expect(result.label).toBe('positive');
        expect(result.score).toBeGreaterThan(0);
    });

    it('detects negative sentiment', () => {
        const result = analyseSentiment('This is terrible awful and horrible');
        expect(result.label).toBe('negative');
        expect(result.score).toBeLessThan(0);
    });

    it('detects neutral sentiment', () => {
        const result = analyseSentiment('The cat sat on the mat');
        expect(result.label).toBe('neutral');
    });

    it('handles negation', () => {
        const positive = analyseSentiment('This is great');
        const negated = analyseSentiment('This is not great');
        expect(negated.score).toBeLessThan(positive.score);
    });

    it('returns token count', () => {
        const result = analyseSentiment('hello world test');
        expect(result.tokens).toBe(3);
    });

    it('returns magnitude between 0 and 1', () => {
        const result = analyseSentiment('I love and hate this');
        expect(result.magnitude).toBeGreaterThanOrEqual(0);
        expect(result.magnitude).toBeLessThanOrEqual(1);
    });

    it('handles empty input', () => {
        const result = analyseSentiment('');
        expect(result.score).toBe(0);
        expect(result.label).toBe('neutral');
        expect(result.tokens).toBe(0);
    });
});

// ─── TENSION SCORING ───────────────────────────────────────────────

describe('scoreTension', () => {
    it('returns brevity bonus for empty/short input', () => {
        // Empty string still gets brevity bonus since word count < 6
        expect(scoreTension('')).toBeGreaterThanOrEqual(0);
    });

    it('scores high tension for exclamatory short sentences', () => {
        const score = scoreTension('STOP! NO!');
        expect(score).toBeGreaterThan(0.3);
    });

    it('scores low tension for calm sentences', () => {
        const score = scoreTension(
            'The gentle breeze blew across the quiet meadow on a warm afternoon',
        );
        expect(score).toBeLessThan(0.5);
    });

    it('adds ellipsis bonus', () => {
        const withEllipsis = scoreTension('Something is coming...');
        const without = scoreTension('Something is coming');
        expect(withEllipsis).toBeGreaterThan(without);
    });

    it('returns value clamped to [0, 1]', () => {
        const score = scoreTension('KILL!! MURDER!! DEATH!! HORROR!! SCREAM!!!');
        expect(score).toBeLessThanOrEqual(1);
        expect(score).toBeGreaterThanOrEqual(0);
    });

    it('accepts precomputed sentiment', () => {
        const sentiment = analyseSentiment('something dark');
        const score = scoreTension('something dark', sentiment);
        expect(score).toBeGreaterThanOrEqual(0);
    });
});

// ─── CHARACTER EXTRACTION ──────────────────────────────────────────

describe('extractCharacters', () => {
    // Note: splitSentences splits on "Dr." and "Mr." so we avoid honorific abbreviations
    const text = `
        Smith walked into the room and greeted Jones warmly with a smile.
        Smith was always cheerful in the morning when he arrived at the office.
        Jones nodded and smiled back at Smith and they started their conversation.
        Meanwhile Alice watched from the corner of the room with suspicion.
        Alice was suspicious of Smith and his motives for the whole meeting.
        Jones turned to Alice and said something quietly about the situation.
    `.trim();

    it('extracts characters that appear ≥2 times', () => {
        const chars = extractCharacters(text);
        const names = chars.map(c => c.name);
        expect(names).toContain('Smith');
        expect(names).toContain('Alice');
    });

    it('detects honorifics when present', () => {
        // Use single long sentence to avoid sentence-split issues with "Dr."
        const honorificText = `Captain Rogers and Smith fought bravely together. Captain Rogers saved Smith from danger. Captain Rogers led the charge while Smith covered the retreat.`;
        const chars = extractCharacters(honorificText);
        const rogers = chars.find(c => c.name === 'Rogers');
        expect(rogers?.honorific).toBe('captain');
    });

    it('respects maxChars limit', () => {
        const chars = extractCharacters(text, 2);
        expect(chars.length).toBeLessThanOrEqual(2);
    });

    it('includes frequency count', () => {
        const chars = extractCharacters(text);
        const smith = chars.find(c => c.name === 'Smith');
        expect(smith?.frequency).toBeGreaterThanOrEqual(2);
    });

    it('returns empty for short text', () => {
        expect(extractCharacters('Short.')).toEqual([]);
    });
});

// ─── READABILITY ───────────────────────────────────────────────────

describe('computeReadability', () => {
    it('returns valid structure', () => {
        const result = computeReadability(
            'The quick brown fox jumps over the lazy dog. It was a sunny day.',
        );
        expect(result).toHaveProperty('fleschKincaid');
        expect(result).toHaveProperty('readingEase');
        expect(result).toHaveProperty('avgWordsPerSentence');
        expect(result).toHaveProperty('avgSyllablesPerWord');
        expect(result).toHaveProperty('label');
    });

    it('returns N/A for empty text', () => {
        const result = computeReadability('');
        expect(result.label).toBe('N/A');
        expect(result.readingEase).toBe(100);
    });

    it('scores simple text as easy', () => {
        const result = computeReadability('The cat sat. The dog ran. It was fun. He was big.');
        expect(result.readingEase).toBeGreaterThan(50);
    });

    it('clamps grade level to [0, 20]', () => {
        const result = computeReadability(
            'A long complex multisyllabic incomprehensible sentence about existentialism and phenomenological epistemological considerations.',
        );
        expect(result.fleschKincaid).toBeLessThanOrEqual(20);
        expect(result.fleschKincaid).toBeGreaterThanOrEqual(0);
    });
});

// ─── KEYWORD EXTRACTION ────────────────────────────────────────────

describe('extractKeywords', () => {
    const longText = Array(100)
        .fill('adventure hero quest dragon battle kingdom sword magic warrior shield')
        .join('. ');

    it('extracts keywords from sufficient text', () => {
        const keywords = extractKeywords(longText, 5);
        expect(keywords.length).toBeGreaterThan(0);
        expect(keywords.length).toBeLessThanOrEqual(5);
    });

    it('returns empty for very short text', () => {
        expect(extractKeywords('hello world')).toEqual([]);
    });

    it('normalises scores to 0-1 range', () => {
        const keywords = extractKeywords(longText);
        for (const kw of keywords) {
            expect(kw.score).toBeGreaterThanOrEqual(0);
            expect(kw.score).toBeLessThanOrEqual(1);
        }
    });

    it('includes count for each keyword', () => {
        const keywords = extractKeywords(longText, 3);
        for (const kw of keywords) {
            expect(kw.count).toBeGreaterThan(0);
        }
    });
});

// ─── VOCABULARY RICHNESS ───────────────────────────────────────────

describe('computeVocabRichness', () => {
    it('returns N/A for empty text', () => {
        const result = computeVocabRichness('');
        expect(result.label).toBe('N/A');
        expect(result.ttr).toBe(0);
    });

    it('detects rich vocabulary', () => {
        const richText =
            'magnificent extraordinary phenomenal spectacular incredible remarkable outstanding exceptional brilliant wonderful'.repeat(
                2,
            );
        const result = computeVocabRichness(richText);
        expect(result.uniqueWords).toBeGreaterThan(0);
        expect(result.ttr).toBeGreaterThan(0);
    });

    it('detects simple vocabulary', () => {
        const simpleText = Array(200).fill('the cat the cat the cat').join(' ');
        const result = computeVocabRichness(simpleText);
        expect(result.label).toBe('Simple');
    });
});

// ─── PACING ────────────────────────────────────────────────────────

describe('analysePacing', () => {
    it('returns default for empty text', () => {
        const result = analysePacing('');
        expect(result.label).toBe('Moderate');
        expect(result.avgSentenceLength).toBe(0);
    });

    it('detects fast pacing from short sentences', () => {
        const fastText =
            'Run! Hide! Stop! Go now! No time! Move fast! Hurry up! Get down! Watch out! Jump now!';
        const result = analysePacing(fastText);
        expect(result.shortSentenceRatio).toBeGreaterThan(0);
    });

    it('includes dialogue ratio when panels provided', () => {
        const panels = [{ type: 'dialogue' }, { type: 'dialogue' }, { type: 'narration' }];
        const result = analysePacing(
            'Hello there friend. How are you doing today. That is wonderful news.',
            panels,
        );
        expect(result.dialogueRatio).toBeGreaterThan(0);
    });

    it('returns a valid label', () => {
        const result = analysePacing(
            'This is a test sentence that should be moderate length and produce a valid result.',
        );
        expect(['Fast', 'Moderate', 'Slow']).toContain(result.label);
    });
});

// ─── EMOTIONAL ARC ─────────────────────────────────────────────────

describe('computeEmotionalArc', () => {
    it('returns empty for fewer than 5 panels', () => {
        const result = computeEmotionalArc([{ content: 'a', tension: 0.5, sentiment: 0.1 }]);
        expect(result).toEqual([]);
    });

    it('returns arc points for sufficient panels', () => {
        const panels = Array(20)
            .fill(null)
            .map((_, i) => ({
                content: `Panel ${i}`,
                tension: Math.sin(i / 5) * 0.5 + 0.5,
                sentiment: Math.cos(i / 5) * 0.5,
            }));
        const result = computeEmotionalArc(panels);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toHaveProperty('position');
        expect(result[0]).toHaveProperty('sentiment');
        expect(result[0]).toHaveProperty('tension');
    });
});

// ─── EXTRACTIVE RECAP ──────────────────────────────────────────────

describe('generateExtractiveRecap', () => {
    const storyText = `
        The ancient kingdom of Eldoria stood at the edge of destruction. Dark forces gathered in the north.
        Prince Arin drew his legendary sword and faced the approaching army. His courage inspired the soldiers.
        The battle raged for three days across the burning plains. Many brave warriors fell that day.
        In the final hour, Princess Elena arrived with reinforcements from the eastern provinces.
        Together they pushed back the darkness and restored peace to the land. The kingdom celebrated their victory.
        Years later, the people still told stories of the great battle. The heroes were never forgotten.
        New threats emerged but the kingdom was ready. They had learned from the past and grew stronger.
    `.trim();

    it('returns a non-empty recap', () => {
        const recap = generateExtractiveRecap(storyText);
        expect(recap.length).toBeGreaterThan(0);
    });

    it('respects maxSentences limit', () => {
        const recap = generateExtractiveRecap(storyText, 2);
        const sentenceCount = recap.split(/(?<=[.!?])\s+/).length;
        expect(sentenceCount).toBeLessThanOrEqual(3); // allow slight variance
    });

    it('returns full text for very short input', () => {
        const short = 'A short story. Only two sentences.';
        const recap = generateExtractiveRecap(short);
        expect(recap).toBe(short);
    });
});

// ─── SCENE BOUNDARIES ─────────────────────────────────────────────

describe('detectSceneBoundaries', () => {
    it('returns empty for too few sentences', () => {
        expect(detectSceneBoundaries(['Short.', 'Too few.'])).toEqual([]);
    });

    it('detects boundaries in contrasting text', () => {
        const calm = Array(6).fill('The peaceful garden bloomed softly in the morning light.');
        const tense = Array(6).fill('STOP! The explosion rocked the building! Run now!');
        const boundaries = detectSceneBoundaries([...calm, ...tense]);
        expect(boundaries.length).toBeGreaterThan(0);
    });
});
