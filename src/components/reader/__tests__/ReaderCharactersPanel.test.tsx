import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReaderWordInsight } from '../../../lib/runtime/readerApis';
import { ReaderCharactersPanel } from '../ReaderCharactersPanel';
import { useReaderDiscovery, useReaderFeedback } from '../../../hooks';

vi.mock('../../../hooks', () => ({
    useReaderDiscovery: vi.fn(),
    useReaderFeedback: vi.fn(),
}));

describe('ReaderCharactersPanel', () => {
    function mockBaseHooks() {
        vi.mocked(useReaderDiscovery).mockReturnValue({
            wordQuery: '',
            setWordQuery: vi.fn(),
            lookupWord: vi.fn().mockResolvedValue(undefined),
            isWordLookupLoading: false,
            isWordSuggestionLoading: false,
            wordLookupError: null,
            wordSuggestionError: null,
            wordInsight: null,
            wordSuggestions: [],
            recentWords: [],
        });
        vi.mocked(useReaderFeedback).mockReturnValue({
            feedbackMessage: '',
            setFeedbackMessage: vi.fn(),
            feedbackCategory: 'ux',
            setFeedbackCategory: vi.fn(),
            feedbackError: null,
            feedbackSuccess: null,
            recentFeedback: [],
            submitFeedback: vi.fn(),
        });
    }

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
            isWordSuggestionLoading: false,
            wordLookupError: null,
            wordSuggestionError: null,
            wordInsight,
            wordSuggestions: [],
            recentWords: [],
        });
        const submitFeedback = vi.fn();
        vi.mocked(useReaderFeedback).mockReturnValue({
            feedbackMessage: '',
            setFeedbackMessage: vi.fn(),
            feedbackCategory: 'ux',
            setFeedbackCategory: vi.fn(),
            feedbackError: null,
            feedbackSuccess: null,
            recentFeedback: [],
            submitFeedback,
        });

        render(<ReaderCharactersPanel insights={null} isOpen onClose={() => {}} />);

        fireEvent.click(screen.getByRole('button', { name: 'ally' }));
        fireEvent.click(screen.getByRole('button', { name: 'enemy' }));

        expect(setWordQuery).toHaveBeenNthCalledWith(1, 'ally');
        expect(setWordQuery).toHaveBeenNthCalledWith(2, 'enemy');
        expect(lookupWord).toHaveBeenNthCalledWith(1, 'ally');
        expect(lookupWord).toHaveBeenNthCalledWith(2, 'enemy');
    });

    it('submits feedback through feedback hook handler', () => {
        const submitFeedback = vi.fn();
        mockBaseHooks();
        vi.mocked(useReaderFeedback).mockReturnValue({
            feedbackMessage: 'Please add more keyboard shortcuts.',
            setFeedbackMessage: vi.fn(),
            feedbackCategory: 'feature',
            setFeedbackCategory: vi.fn(),
            feedbackError: null,
            feedbackSuccess: null,
            recentFeedback: [],
            submitFeedback,
        });

        render(<ReaderCharactersPanel insights={null} isOpen onClose={() => {}} />);

        fireEvent.click(screen.getByRole('button', { name: 'Submit feedback' }));
        expect(submitFeedback).toHaveBeenCalledWith('reader-insights');
    });
});
