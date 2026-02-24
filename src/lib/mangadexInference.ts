/**
 * mangadexInference.ts — Offline inference module for manga metadata
 * 
 * Provides deterministic algorithms to generate/infer synopsis, codex,
 * and metadata when MangaDex data is incomplete or unavailable.
 * Works completely offline without AI or API calls.
 */

import type { MangaDexManga } from './mangadex';
import type { MangaCodex } from './mangadexCache';
import { getPreferredTitle } from './mangadex';

// ─── TAG MAPPINGS ───────────────────────────────────────────────────────────

const GENRE_TAGS = new Set([
    'action', 'adventure', 'comedy', 'drama', 'fantasy', 'horror',
    'mystery', 'psychological', 'romance', 'sci-fi', 'slice of life',
    'sports', 'thriller', 'tragedy', 'isekai', 'magical girls',
    'mecha', 'medical', 'military', 'music', 'philosophical',
    'superhero', 'wuxia', 'crime', 'survival'
]);

const THEME_TAGS = new Set([
    'school life', 'martial arts', 'supernatural', 'demons', 'vampires',
    'zombies', 'monsters', 'magic', 'time travel', 'virtual reality',
    'video games', 'cooking', 'farming', 'office workers', 'police',
    'samurai', 'ninja', 'pirates', 'post-apocalyptic', 'historical',
    'reincarnation', 'villainess', 'harem', 'reverse harem'
]);

const DEMOGRAPHIC_TAGS: Record<string, string> = {
    'shounen': 'Young Male (Shounen)',
    'shoujo': 'Young Female (Shoujo)',
    'seinen': 'Adult Male (Seinen)',
    'josei': 'Adult Female (Josei)',
    'kodomomuke': 'Children',
};

const CONTENT_WARNING_TAGS = new Set([
    'gore', 'sexual violence', 'violence', 'self-harm', 'suicide',
    'drugs', 'alcohol', 'smoking', 'mature themes'
]);

const MOOD_MAP: Record<string, string[]> = {
    'dark and intense': ['horror', 'psychological', 'thriller', 'tragedy', 'gore', 'violence'],
    'lighthearted and fun': ['comedy', 'slice of life', 'school life', '4-koma'],
    'epic and adventurous': ['action', 'adventure', 'fantasy', 'isekai', 'martial arts'],
    'romantic and emotional': ['romance', 'drama', 'josei', 'shoujo'],
    'mysterious and suspenseful': ['mystery', 'crime', 'supernatural', 'psychological'],
    'action-packed': ['action', 'sports', 'martial arts', 'military', 'mecha'],
};

const NARRATIVE_STYLES: Record<string, string[]> = {
    'Fast-paced action with dramatic battles': ['action', 'shounen', 'martial arts', 'sports'],
    'Character-driven emotional storytelling': ['drama', 'slice of life', 'romance', 'josei'],
    'Mystery with plot twists and revelations': ['mystery', 'psychological', 'thriller', 'crime'],
    'World-building focused adventure': ['fantasy', 'isekai', 'sci-fi', 'adventure'],
    'Comedic with situational humor': ['comedy', '4-koma', 'school life', 'slice of life'],
    'Dark psychological exploration': ['psychological', 'horror', 'tragedy', 'seinen'],
};

// ─── INFERENCE FUNCTIONS ────────────────────────────────────────────────────

/**
 * Extract tag names from MangaDex manga object
 */
function extractTagNames(manga: MangaDexManga): string[] {
    return manga.attributes.tags.map(tag => {
        const name = tag.attributes?.name;
        return (name?.['en'] || Object.values(name || {})[0] || '').toLowerCase();
    }).filter(Boolean);
}

/**
 * Infer genres from tags
 */
function inferGenres(tags: string[]): string[] {
    return tags.filter(tag => GENRE_TAGS.has(tag)).map(capitalize);
}

/**
 * Infer themes from tags
 */
function inferThemes(tags: string[]): string[] {
    return tags.filter(tag => THEME_TAGS.has(tag)).map(capitalize);
}

/**
 * Infer target audience from tags or original language
 */
function inferTargetAudience(tags: string[], originalLanguage: string): string {
    for (const tag of tags) {
        if (DEMOGRAPHIC_TAGS[tag]) {
            return DEMOGRAPHIC_TAGS[tag];
        }
    }
    // Infer from language
    if (originalLanguage === 'ko') return 'General (Korean Manhwa)';
    if (originalLanguage === 'zh') return 'General (Chinese Manhua)';
    return 'General Audience';
}

/**
 * Infer content warnings from tags
 */
function inferContentWarnings(tags: string[], contentRating: string): string[] {
    const warnings = tags.filter(tag => CONTENT_WARNING_TAGS.has(tag)).map(capitalize);
    
    if (contentRating === 'suggestive') {
        warnings.push('Suggestive Content');
    } else if (contentRating === 'erotica' || contentRating === 'pornographic') {
        warnings.push('Adult Content (18+)');
    }
    
    return [...new Set(warnings)];
}

/**
 * Estimate length category based on chapter count or status
 */
function estimateLength(
    lastChapter: string | null,
    status: string
): { category: 'oneshot' | 'short' | 'medium' | 'long' | 'epic'; readingTime: string } {
    const chapterNum = lastChapter ? parseFloat(lastChapter) : 0;
    
    if (chapterNum <= 1 || status === 'oneshot') {
        return { category: 'oneshot', readingTime: '15-30 minutes' };
    } else if (chapterNum <= 20) {
        return { category: 'short', readingTime: '2-4 hours' };
    } else if (chapterNum <= 100) {
        return { category: 'medium', readingTime: '10-20 hours' };
    } else if (chapterNum <= 300) {
        return { category: 'long', readingTime: '30-60 hours' };
    } else {
        return { category: 'epic', readingTime: '100+ hours' };
    }
}

/**
 * Infer mood based on tags
 */
function inferMood(tags: string[]): string {
    let bestMatch = 'Mixed genre';
    let bestScore = 0;
    
    for (const [mood, matchTags] of Object.entries(MOOD_MAP)) {
        const score = tags.filter(t => matchTags.includes(t)).length;
        if (score > bestScore) {
            bestScore = score;
            bestMatch = mood;
        }
    }
    
    return capitalize(bestMatch);
}

/**
 * Infer narrative style based on tags
 */
function inferNarrativeStyle(tags: string[]): string {
    let bestMatch = 'Traditional manga storytelling';
    let bestScore = 0;
    
    for (const [style, matchTags] of Object.entries(NARRATIVE_STYLES)) {
        const score = tags.filter(t => matchTags.includes(t)).length;
        if (score > bestScore) {
            bestScore = score;
            bestMatch = style;
        }
    }
    
    return bestMatch;
}

/**
 * Generate similar manga suggestions based on genre/theme overlap
 */
function inferSimilarTo(tags: string[]): string[] {
    const suggestions: string[] = [];
    
    // Genre-based suggestions (these are well-known series)
    if (tags.includes('action') && tags.includes('shounen')) {
        suggestions.push('Naruto', 'One Piece', 'Dragon Ball');
    }
    if (tags.includes('psychological') && tags.includes('thriller')) {
        suggestions.push('Death Note', 'Monster', 'Psycho-Pass');
    }
    if (tags.includes('isekai') && tags.includes('fantasy')) {
        suggestions.push('Re:Zero', 'Sword Art Online', 'That Time I Got Reincarnated as a Slime');
    }
    if (tags.includes('romance') && tags.includes('school life')) {
        suggestions.push('Kaguya-sama', 'Toradora', 'Your Lie in April');
    }
    if (tags.includes('horror')) {
        suggestions.push('Junji Ito Collection', 'Tokyo Ghoul', 'Parasyte');
    }
    if (tags.includes('sports')) {
        suggestions.push('Haikyuu!!', 'Slam Dunk', 'Kuroko no Basket');
    }
    if (tags.includes('slice of life') && tags.includes('comedy')) {
        suggestions.push('Nichijou', 'Yotsuba&!', 'Barakamon');
    }
    
    // Shuffle and return top 3
    return suggestions.sort(() => Math.random() - 0.5).slice(0, 3);
}

/**
 * Capitalize first letter of each word
 */
function capitalize(str: string): string {
    return str.replace(/\b\w/g, c => c.toUpperCase());
}

// ─── PUBLIC API ─────────────────────────────────────────────────────────────

/**
 * Generate a complete manga codex from available metadata
 */
export function generateMangaCodex(manga: MangaDexManga): MangaCodex {
    const tags = extractTagNames(manga);
    const lengthInfo = estimateLength(manga.attributes.lastChapter, manga.attributes.status);
    
    return {
        genres: inferGenres(tags),
        themes: inferThemes(tags),
        targetAudience: inferTargetAudience(tags, manga.attributes.originalLanguage),
        contentWarnings: inferContentWarnings(tags, manga.attributes.contentRating),
        estimatedLength: lengthInfo.category,
        readingTime: lengthInfo.readingTime,
        similarTo: inferSimilarTo(tags),
        mood: inferMood(tags),
        narrativeStyle: inferNarrativeStyle(tags),
    };
}

/**
 * Generate a synopsis when none is available
 */
export function generateSynopsis(manga: MangaDexManga): string {
    const title = getPreferredTitle(manga.attributes.title);
    const tags = extractTagNames(manga);
    const genres = inferGenres(tags);
    const themes = inferThemes(tags);
    const mood = inferMood(tags);
    const status = manga.attributes.status;
    const year = manga.attributes.year;
    
    // Build synopsis from available metadata
    const parts: string[] = [];
    
    // Opening
    if (genres.length > 0) {
        parts.push(`${title} is a ${genres.slice(0, 3).join('/')} manga`);
    } else {
        parts.push(`${title} is a manga`);
    }
    
    // Year and status
    if (year) {
        parts[0] += ` that began serialization in ${year}`;
    }
    if (status === 'completed') {
        parts[0] += ' and has been completed';
    } else if (status === 'ongoing') {
        parts[0] += ' and is currently ongoing';
    } else if (status === 'hiatus') {
        parts[0] += ' but is currently on hiatus';
    }
    parts[0] += '.';
    
    // Themes
    if (themes.length > 0) {
        parts.push(`The story explores themes of ${themes.slice(0, 4).join(', ')}.`);
    }
    
    // Mood
    parts.push(`Readers can expect a ${mood.toLowerCase()} experience.`);
    
    // Chapter info
    if (manga.attributes.lastChapter) {
        const chapterCount = parseFloat(manga.attributes.lastChapter);
        if (chapterCount > 0) {
            parts.push(`The series spans ${Math.round(chapterCount)} chapters.`);
        }
    }
    
    return parts.join(' ');
}

/**
 * Enrich existing synopsis with additional metadata
 */
export function enrichSynopsis(existingSynopsis: string, manga: MangaDexManga): string {
    if (!existingSynopsis || existingSynopsis.trim().length < 20) {
        return generateSynopsis(manga);
    }
    
    // Add metadata footer if synopsis is short
    if (existingSynopsis.length < 200) {
        const codex = generateMangaCodex(manga);
        const additions: string[] = [];
        
        if (codex.genres.length > 0 && !existingSynopsis.toLowerCase().includes('genre')) {
            additions.push(`Genre: ${codex.genres.join(', ')}`);
        }
        if (codex.mood && !existingSynopsis.toLowerCase().includes('mood')) {
            additions.push(`Mood: ${codex.mood}`);
        }
        
        if (additions.length > 0) {
            return `${existingSynopsis}\n\n${additions.join(' | ')}`;
        }
    }
    
    return existingSynopsis;
}

/**
 * Check connectivity status
 */
export function isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Get connectivity status with details
 */
export function getConnectivityStatus(): {
    online: boolean;
    effectiveType?: string;
    downlink?: number;
} {
    const online = isOnline();
    
    // Check Network Information API if available
    const connection = (navigator as Navigator & {
        connection?: { effectiveType?: string; downlink?: number };
    }).connection;
    
    return {
        online,
        effectiveType: connection?.effectiveType,
        downlink: connection?.downlink,
    };
}
