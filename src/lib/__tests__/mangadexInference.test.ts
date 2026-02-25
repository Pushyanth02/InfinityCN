import { describe, it, expect } from 'vitest';
import {
    generateMangaCodex,
    generateSynopsis,
    enrichSynopsis,
    isOnline,
    getConnectivityStatus,
} from '../mangadexInference';
import type { MangaDexManga } from '../mangadex';

// ─── HELPERS ──────────────────────────────────────────────────────

function makeManga(
    overrides: Partial<MangaDexManga['attributes']> = {},
    id = 'test-id',
): MangaDexManga {
    return {
        id,
        type: 'manga',
        attributes: {
            title: { en: 'Test Manga' },
            altTitles: [],
            description: { en: 'A test description' },
            status: 'ongoing',
            year: 2023,
            contentRating: 'safe',
            tags: [],
            originalLanguage: 'ja',
            lastChapter: null,
            lastVolume: null,
            ...overrides,
        },
        relationships: [],
    };
}

function makeTag(name: string) {
    return {
        id: `tag-${name}`,
        attributes: { name: { en: name } },
    };
}

// ─── generateMangaCodex ──────────────────────────────────────────

describe('generateMangaCodex', () => {
    it('extracts genres from tags', () => {
        const manga = makeManga({
            tags: [makeTag('action'), makeTag('adventure'), makeTag('comedy')],
        });
        const codex = generateMangaCodex(manga);
        expect(codex.genres).toContain('Action');
        expect(codex.genres).toContain('Adventure');
        expect(codex.genres).toContain('Comedy');
    });

    it('extracts themes from tags', () => {
        const manga = makeManga({
            tags: [makeTag('school life'), makeTag('supernatural')],
        });
        const codex = generateMangaCodex(manga);
        expect(codex.themes).toContain('School Life');
        expect(codex.themes).toContain('Supernatural');
    });

    it('separates genres from themes', () => {
        const manga = makeManga({
            tags: [makeTag('action'), makeTag('school life')],
        });
        const codex = generateMangaCodex(manga);
        expect(codex.genres).toContain('Action');
        expect(codex.genres).not.toContain('School Life');
        expect(codex.themes).toContain('School Life');
        expect(codex.themes).not.toContain('Action');
    });

    it('infers target audience from demographic tags', () => {
        const manga = makeManga({
            tags: [makeTag('shounen')],
        });
        const codex = generateMangaCodex(manga);
        expect(codex.targetAudience).toContain('Shounen');
    });

    it('falls back to language-based audience for Korean', () => {
        const manga = makeManga({ originalLanguage: 'ko' });
        const codex = generateMangaCodex(manga);
        expect(codex.targetAudience).toContain('Korean');
    });

    it('falls back to language-based audience for Chinese', () => {
        const manga = makeManga({ originalLanguage: 'zh' });
        const codex = generateMangaCodex(manga);
        expect(codex.targetAudience).toContain('Chinese');
    });

    it('infers content warnings from tags', () => {
        const manga = makeManga({
            tags: [makeTag('gore'), makeTag('violence')],
            contentRating: 'safe',
        });
        const codex = generateMangaCodex(manga);
        expect(codex.contentWarnings).toContain('Gore');
        expect(codex.contentWarnings).toContain('Violence');
    });

    it('adds content warning for suggestive rating', () => {
        const manga = makeManga({ contentRating: 'suggestive' });
        const codex = generateMangaCodex(manga);
        expect(codex.contentWarnings).toContain('Suggestive Content');
    });

    it('adds content warning for erotica rating', () => {
        const manga = makeManga({ contentRating: 'erotica' });
        const codex = generateMangaCodex(manga);
        expect(codex.contentWarnings.some(w => w.includes('Adult'))).toBe(true);
    });

    it('estimates oneshot length', () => {
        const manga = makeManga({ lastChapter: '1', status: 'completed' });
        const codex = generateMangaCodex(manga);
        expect(codex.estimatedLength).toBe('oneshot');
    });

    it('estimates short length', () => {
        const manga = makeManga({ lastChapter: '15' });
        const codex = generateMangaCodex(manga);
        expect(codex.estimatedLength).toBe('short');
    });

    it('estimates medium length', () => {
        const manga = makeManga({ lastChapter: '50' });
        const codex = generateMangaCodex(manga);
        expect(codex.estimatedLength).toBe('medium');
    });

    it('estimates long length', () => {
        const manga = makeManga({ lastChapter: '200' });
        const codex = generateMangaCodex(manga);
        expect(codex.estimatedLength).toBe('long');
    });

    it('estimates epic length', () => {
        const manga = makeManga({ lastChapter: '500' });
        const codex = generateMangaCodex(manga);
        expect(codex.estimatedLength).toBe('epic');
    });

    it('infers mood from tags', () => {
        const manga = makeManga({
            tags: [makeTag('horror'), makeTag('psychological'), makeTag('thriller')],
        });
        const codex = generateMangaCodex(manga);
        expect(codex.mood.toLowerCase()).toContain('dark');
    });

    it('infers narrative style from tags', () => {
        const manga = makeManga({
            tags: [makeTag('action'), makeTag('shounen'), makeTag('martial arts')],
        });
        const codex = generateMangaCodex(manga);
        expect(codex.narrativeStyle.toLowerCase()).toContain('action');
    });

    it('returns similar manga suggestions', () => {
        const manga = makeManga({
            tags: [makeTag('action'), makeTag('shounen')],
        });
        const codex = generateMangaCodex(manga);
        expect(codex.similarTo.length).toBeGreaterThan(0);
        expect(codex.similarTo.length).toBeLessThanOrEqual(3);
    });

    it('handles manga with no tags', () => {
        const manga = makeManga({ tags: [] });
        const codex = generateMangaCodex(manga);
        expect(codex.genres).toEqual([]);
        expect(codex.themes).toEqual([]);
        expect(codex.mood).toBeDefined();
    });

    it('includes readingTime estimate', () => {
        const manga = makeManga({ lastChapter: '50' });
        const codex = generateMangaCodex(manga);
        expect(codex.readingTime).toBeDefined();
        expect(codex.readingTime.length).toBeGreaterThan(0);
    });
});

// ─── generateSynopsis ────────────────────────────────────────────

describe('generateSynopsis', () => {
    it('generates a synopsis mentioning the title', () => {
        const manga = makeManga({ title: { en: 'Dragon Quest' } });
        const synopsis = generateSynopsis(manga);
        expect(synopsis).toContain('Dragon Quest');
    });

    it('includes genres when available', () => {
        const manga = makeManga({
            tags: [makeTag('action'), makeTag('adventure')],
        });
        const synopsis = generateSynopsis(manga);
        expect(synopsis.toLowerCase()).toContain('action');
    });

    it('includes year when available', () => {
        const manga = makeManga({ year: 2020 });
        const synopsis = generateSynopsis(manga);
        expect(synopsis).toContain('2020');
    });

    it('mentions completed status', () => {
        const manga = makeManga({ status: 'completed' });
        const synopsis = generateSynopsis(manga);
        expect(synopsis.toLowerCase()).toContain('completed');
    });

    it('mentions ongoing status', () => {
        const manga = makeManga({ status: 'ongoing' });
        const synopsis = generateSynopsis(manga);
        expect(synopsis.toLowerCase()).toContain('ongoing');
    });

    it('mentions hiatus status', () => {
        const manga = makeManga({ status: 'hiatus' });
        const synopsis = generateSynopsis(manga);
        expect(synopsis.toLowerCase()).toContain('hiatus');
    });

    it('includes themes', () => {
        const manga = makeManga({
            tags: [makeTag('school life'), makeTag('supernatural')],
        });
        const synopsis = generateSynopsis(manga);
        expect(synopsis.toLowerCase()).toContain('school life');
    });

    it('includes chapter count when available', () => {
        const manga = makeManga({ lastChapter: '42' });
        const synopsis = generateSynopsis(manga);
        expect(synopsis).toContain('42');
    });

    it('works with no optional data', () => {
        const manga = makeManga({
            year: null,
            lastChapter: null,
            tags: [],
        });
        const synopsis = generateSynopsis(manga);
        expect(synopsis.length).toBeGreaterThan(0);
        expect(synopsis).toContain('Test Manga');
    });
});

// ─── enrichSynopsis ──────────────────────────────────────────────

describe('enrichSynopsis', () => {
    it('falls back to generating synopsis for very short input', () => {
        const manga = makeManga({ title: { en: 'My Manga' } });
        const result = enrichSynopsis('Short', manga);
        expect(result).toContain('My Manga');
    });

    it('adds metadata to a short synopsis', () => {
        const manga = makeManga({
            tags: [makeTag('action'), makeTag('adventure')],
        });
        const result = enrichSynopsis('A brief synopsis about an adventure.', manga);
        expect(result.length).toBeGreaterThan('A brief synopsis about an adventure.'.length);
    });

    it('returns long synopsis unchanged', () => {
        const manga = makeManga();
        const longSynopsis = 'A'.repeat(250);
        const result = enrichSynopsis(longSynopsis, manga);
        expect(result).toBe(longSynopsis);
    });

    it('does not duplicate genre info if already present', () => {
        const manga = makeManga({
            tags: [makeTag('action')],
        });
        const result = enrichSynopsis('This manga genre is action packed.', manga);
        // If "genre" is already in the text, it should not add Genre line
        const genreCount = (result.match(/genre/gi) || []).length;
        expect(genreCount).toBeLessThanOrEqual(1);
    });
});

// ─── Connectivity ────────────────────────────────────────────────

describe('isOnline', () => {
    it('returns a boolean', () => {
        const result = isOnline();
        expect(typeof result).toBe('boolean');
    });
});

describe('getConnectivityStatus', () => {
    it('returns an object with online property', () => {
        const status = getConnectivityStatus();
        expect(status).toHaveProperty('online');
        expect(typeof status.online).toBe('boolean');
    });
});
