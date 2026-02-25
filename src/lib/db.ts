import Dexie, { type Table } from 'dexie';
import type { MangaPanel, Character, Atmosphere, ChapterInsights } from '../types';

interface SavedChapter {
    id?: number;
    title: string;
    createdAt: number;
    panels: MangaPanel[];
    characters: Character[];
    recap: string | null;
    atmosphere: Atmosphere | null;
    insights: ChapterInsights | null;
    rawText: string;
}

class InfinityDatabase extends Dexie {
    chapters!: Table<SavedChapter>;

    constructor() {
        super('InfinityCNDatabase');
        this.version(1).stores({
            chapters: '++id, title, createdAt',
        });
    }
}

export const db = new InfinityDatabase();
