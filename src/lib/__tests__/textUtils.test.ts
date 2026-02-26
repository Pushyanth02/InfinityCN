import { describe, it, expect } from 'vitest';
import {
    cleanText,
    removeBookArtifacts,
    chunkText,
    chunkTextWithOverlap,
    calculateTextStatistics,
    searchText,
    highlightMatches,
    extractUrls,
    extractEmails,
    extractNumbers,
    toTitleCase,
    truncate,
    normalizeWhitespace,
    detectScript,
} from '../textUtils';

describe('Text Utilities', () => {
    describe('cleanText', () => {
        it('normalizes line endings', () => {
            expect(cleanText('line1\r\nline2\rline3')).toBe('line1\nline2\nline3');
        });

        it('removes excessive blank lines', () => {
            expect(cleanText('para1\n\n\n\npara2')).toBe('para1\n\npara2');
        });

        it('normalizes unicode quotes', () => {
            expect(cleanText('\u201cHello\u201d \u2018World\u2019')).toBe('"Hello" \'World\'');
        });

        it('normalizes dashes', () => {
            expect(cleanText('em—dash and en–dash')).toBe('em-dash and en-dash');
        });
    });

    describe('removeBookArtifacts', () => {
        it('removes page numbers', () => {
            const text = 'Content here.\nPage 42\nMore content.';
            expect(removeBookArtifacts(text)).toBe('Content here.\nMore content.');
        });

        it('removes copyright notices', () => {
            const text = 'Chapter One\nCopyright © 2024 Author\nStory begins';
            const result = removeBookArtifacts(text);
            expect(result).not.toContain('Copyright');
        });
    });

    describe('chunkText', () => {
        it('splits text into chunks by paragraph', () => {
            const text = 'Para one with words.\n\nPara two here.\n\nPara three now.';
            const chunks = chunkText(text, 5);

            expect(chunks.length).toBeGreaterThan(0);
            chunks.forEach(chunk => {
                expect(chunk.text.length).toBeGreaterThan(0);
                expect(chunk.wordCount).toBeGreaterThan(0);
            });
        });

        it('preserves all content', () => {
            const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
            const chunks = chunkText(text, 100);

            const reconstructed = chunks.map(c => c.text).join('\n\n');
            expect(reconstructed).toBe(text);
        });
    });

    describe('chunkTextWithOverlap', () => {
        it('creates overlapping chunks', () => {
            const words = Array(20).fill('word').join(' ');
            const chunks = chunkTextWithOverlap(words, 10, 3);

            expect(chunks.length).toBeGreaterThan(1);
        });
    });

    describe('calculateTextStatistics', () => {
        it('calculates correct word count', () => {
            const stats = calculateTextStatistics('one two three four five');
            expect(stats.wordCount).toBe(5);
        });

        it('calculates correct character counts', () => {
            const stats = calculateTextStatistics('hello world');
            expect(stats.charCount).toBe(11);
            expect(stats.charCountNoSpaces).toBe(10);
        });

        it('calculates sentence count', () => {
            const stats = calculateTextStatistics('First sentence. Second one! Third?');
            expect(stats.sentenceCount).toBe(3);
        });

        it('calculates paragraph count', () => {
            const stats = calculateTextStatistics('Para one.\n\nPara two.\n\nPara three.');
            expect(stats.paragraphCount).toBe(3);
        });

        it('estimates reading time', () => {
            const text = Array(450).fill('word').join(' '); // ~2 minutes
            const stats = calculateTextStatistics(text);
            expect(stats.estimatedReadingTime).toBe(2);
        });
    });

    describe('searchText', () => {
        it('finds all occurrences', () => {
            const matches = searchText('the cat and the dog and the bird', 'the');
            expect(matches.length).toBe(3);
        });

        it('is case insensitive by default', () => {
            const matches = searchText('The THE the', 'the');
            expect(matches.length).toBe(3);
        });

        it('supports case sensitive search', () => {
            const matches = searchText('The THE the', 'the', { caseSensitive: true });
            expect(matches.length).toBe(1);
        });

        it('includes context', () => {
            const matches = searchText('prefix target suffix', 'target', { contextLength: 10 });
            expect(matches[0].context).toContain('prefix');
            expect(matches[0].context).toContain('suffix');
        });
    });

    describe('highlightMatches', () => {
        it('wraps matches in tags', () => {
            const matches = searchText('hello world', 'world');
            const result = highlightMatches('hello world', matches);
            expect(result).toBe('hello <mark>world</mark>');
        });

        it('uses custom tag', () => {
            const matches = searchText('test', 'test');
            const result = highlightMatches('test', matches, 'strong');
            expect(result).toBe('<strong>test</strong>');
        });
    });

    describe('extractUrls', () => {
        it('extracts HTTP URLs', () => {
            const urls = extractUrls('Visit http://example.com and https://secure.com');
            expect(urls).toContain('http://example.com');
            expect(urls).toContain('https://secure.com');
        });

        it('returns empty array when no URLs', () => {
            expect(extractUrls('no urls here')).toEqual([]);
        });
    });

    describe('extractEmails', () => {
        it('extracts email addresses', () => {
            const emails = extractEmails('Contact user@example.com or admin@test.org');
            expect(emails).toContain('user@example.com');
            expect(emails).toContain('admin@test.org');
        });
    });

    describe('extractNumbers', () => {
        it('extracts integers', () => {
            const numbers = extractNumbers('There are 42 items and 7 boxes');
            expect(numbers).toContain(42);
            expect(numbers).toContain(7);
        });

        it('extracts decimals', () => {
            const numbers = extractNumbers('Price is 19.99 and tax is 1.5');
            expect(numbers).toContain(19.99);
            expect(numbers).toContain(1.5);
        });

        it('extracts negative numbers', () => {
            const numbers = extractNumbers('Temperature dropped to -5 degrees');
            expect(numbers).toContain(-5);
        });
    });

    describe('toTitleCase', () => {
        it('capitalizes first letter of words', () => {
            expect(toTitleCase('hello world')).toBe('Hello World');
        });

        it('keeps minor words lowercase', () => {
            expect(toTitleCase('the lord of the rings')).toBe('The Lord of the Rings');
        });

        it('capitalizes first word even if minor', () => {
            expect(toTitleCase('the quick brown fox')).toBe('The Quick Brown Fox');
        });
    });

    describe('truncate', () => {
        it('returns original if within limit', () => {
            expect(truncate('short', 10)).toBe('short');
        });

        it('truncates with ellipsis', () => {
            const result = truncate('this is a long sentence', 15);
            expect(result.length).toBeLessThanOrEqual(15);
            expect(result).toContain('...');
        });

        it('uses custom suffix', () => {
            const result = truncate('long text here', 10, '…');
            expect(result).toContain('…');
        });
    });

    describe('normalizeWhitespace', () => {
        it('collapses multiple spaces', () => {
            expect(normalizeWhitespace('too    many   spaces')).toBe('too many spaces');
        });

        it('trims leading/trailing whitespace', () => {
            expect(normalizeWhitespace('  padded  ')).toBe('padded');
        });
    });

    describe('detectScript', () => {
        it('detects Latin text', () => {
            expect(detectScript('Hello World')).toBe('latin');
        });

        it('detects Japanese text', () => {
            expect(detectScript('こんにちは世界')).toBe('japanese');
        });

        it('detects Chinese text', () => {
            expect(detectScript('你好世界你好')).toBe('chinese');
        });

        it('detects Korean text', () => {
            expect(detectScript('안녕하세요')).toBe('korean');
        });

        it('detects Arabic text', () => {
            expect(detectScript('مرحبا بالعالم')).toBe('arabic');
        });

        it('detects Cyrillic text', () => {
            expect(detectScript('Привет мир')).toBe('cyrillic');
        });
    });
});
