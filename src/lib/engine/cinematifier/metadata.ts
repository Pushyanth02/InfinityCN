/**
 * metadata.ts — Narrative Metadata Extraction
 *
 * Extracts genre, tone, and character appearance metadata from
 * AI-generated cinematified output.
 */

import type { CinematicBlock } from '../../../types/cinematifier';

export interface NarrativeMetadata {
    genre?: import('../../../types/cinematifier').BookGenre;
    toneTags?: string[];
    characters: Record<string, import('../../../types/cinematifier').CharacterAppearance>;
}

export function extractOverallMetadata(
    rawText: string | undefined,
    blocks: CinematicBlock[],
): NarrativeMetadata {
    const metadata: NarrativeMetadata = { characters: {} };

    if (rawText) {
        const genreMatch = rawText.match(/\[GENRE:\s*([^\]]+)\]/i);
        if (genreMatch) {
            const rawGenre = genreMatch[1].trim().toLowerCase().replace(/\s+/g, '_');
            const validGenres = [
                'fantasy',
                'romance',
                'thriller',
                'sci_fi',
                'mystery',
                'historical',
                'literary_fiction',
                'horror',
                'adventure',
            ];
            if (validGenres.includes(rawGenre)) {
                metadata.genre = rawGenre as import('../../../types/cinematifier').BookGenre;
            }
        }

        const toneMatch = rawText.match(/\[TONE:\s*([^\]]+)\]/i);
        if (toneMatch) {
            metadata.toneTags = toneMatch[1]
                .split(',')
                .map(t => t.trim().toLowerCase())
                .filter(Boolean);
        }
    }

    // Build characters from dialogue tags
    blocks.forEach((block, index) => {
        if (block.type === 'dialogue' && block.speaker) {
            const name = block.speaker.toUpperCase();
            if (!metadata.characters[name]) {
                metadata.characters[name] = { appearances: [], dialogueCount: 0 };
            }
            metadata.characters[name].appearances.push(index);
            metadata.characters[name].dialogueCount++;
        }
    });

    return metadata;
}
