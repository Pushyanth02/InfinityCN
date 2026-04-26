import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReaderWordInsight } from '../../../lib/runtime/readerApis';
import { ReaderCharactersPanel } from '../ReaderCharactersPanel';
import { useReaderDiscovery } from '../../../hooks';

vi.mock('../../../hooks', () => ({
    useReaderDiscovery: vi.fn(),
}));

describe('ReaderCharactersPanel', () => {
    it('uses discovery hook handlers for related and antonym tags', () => {
        const setWordQuery = vi.fn();
        const lookupWord = vi.fn().mockResolvedValue(undefined);
        const wordInsight: ReaderWordInsight = {
            word: 'test',
            meanings: [{ definition: 'definition', synonyms: [], antonyms: [] }],
            relatedWords: ['ally'],
            antonyms: ['enemy'],
            examples: [],
            sources: ['dictionaryapi'],
        };

        vi.mocked(useReaderDiscovery).mockReturnValue({
            wordQuery: '',
            setWordQuery,
            lookupWord,
            isWordLookupLoading: false,
            wordLookupError: null,
            wordInsight,
            wordSuggestions: [],
            recentWords: [],
        });

        render(<ReaderCharactersPanel insights={null} isOpen onClose={() => {}} />);

        fireEvent.click(screen.getByRole('button', { name: 'ally' }));
        fireEvent.click(screen.getByRole('button', { name: 'enemy' }));

        expect(setWordQuery).toHaveBeenNthCalledWith(1, 'ally');
        expect(setWordQuery).toHaveBeenNthCalledWith(2, 'enemy');
        expect(lookupWord).toHaveBeenNthCalledWith(1, 'ally');
        expect(lookupWord).toHaveBeenNthCalledWith(2, 'enemy');
    });
});
