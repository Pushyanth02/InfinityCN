import Dexie, { type Table } from 'dexie';
import type { MangaPanel, Character, Atmosphere } from '../types';

export interface SavedChapter {
    id?: number;
    title: string;
    createdAt: number;
    panels: MangaPanel[];
    characters: Character[];
    recap: string | null;
    atmosphere: Atmosphere | null;
    // Removed analytics
    rawText: string;
}

export class InfinityDatabase extends Dexie {
    chapters!: Table<SavedChapter>;

    constructor() {
        super('InfinityCNDatabase');
        this.version(1).stores({
            chapters: '++id, title, createdAt'
        });
    }
}

export const db = new InfinityDatabase();
