import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    fetchReaderBookSuggestions,
    lookupReaderWordInsight,
    type ReaderBookSuggestion,
    type ReaderContentType,
    type ReaderWordInsight,
} from '../lib/runtime/readerApis';

export type ReaderSuggestionFilter = ReaderContentType | 'all';

interface UseReaderDiscoveryResult {
    wordQuery: string;
    setWordQuery: (value: string) => void;
    lookupWord: (explicitWord?: string) => Promise<void>;
    isWordLookupLoading: boolean;
    wordLookupError: string | null;
    wordInsight: ReaderWordInsight | null;
    bookSuggestions: ReaderBookSuggestion[];
    isSuggestionsLoading: boolean;
    suggestionFilter: ReaderSuggestionFilter;
    setSuggestionFilter: (value: ReaderSuggestionFilter) => void;
}

export function useReaderDiscovery(bookTitle: string | undefined): UseReaderDiscoveryResult {
    const [wordQuery, setWordQuery] = useState('');
    const [wordInsight, setWordInsight] = useState<ReaderWordInsight | null>(null);
    const [wordLookupError, setWordLookupError] = useState<string | null>(null);
    const [isWordLookupLoading, setIsWordLookupLoading] = useState(false);

    const [bookSuggestions, setBookSuggestions] = useState<ReaderBookSuggestion[]>([]);
    const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
    const [suggestionFilter, setSuggestionFilter] = useState<ReaderSuggestionFilter>('all');

    const normalizedBookTitle = useMemo(() => bookTitle?.trim() ?? '', [bookTitle]);
    const suggestionTypes = useMemo<ReaderContentType[] | undefined>(() => {
        if (suggestionFilter === 'all') return undefined;
        return [suggestionFilter];
    }, [suggestionFilter]);

    const lookupWord = useCallback(
        async (explicitWord?: string) => {
            const requestedWord = (explicitWord ?? wordQuery).trim();
            if (!requestedWord) {
                setWordLookupError('Enter a word to look up.');
                setWordInsight(null);
                return;
            }

            setIsWordLookupLoading(true);
            setWordLookupError(null);

            try {
                const result = await lookupReaderWordInsight(requestedWord);
                if (!result) {
                    setWordInsight(null);
                    setWordLookupError('No lexical data found for that word.');
                    return;
                }

                setWordInsight(result);
                setWordLookupError(null);
            } catch {
                setWordInsight(null);
                setWordLookupError('Word lookup failed. Try again in a moment.');
            } finally {
                setIsWordLookupLoading(false);
            }
        },
        [wordQuery],
    );

    useEffect(() => {
        if (!normalizedBookTitle) {
            setBookSuggestions([]);
            return;
        }

        let cancelled = false;
        setIsSuggestionsLoading(true);

        void fetchReaderBookSuggestions(normalizedBookTitle, {
            includeTypes: suggestionTypes,
            limit: 10,
        })
            .then(suggestions => {
                if (cancelled) return;
                setBookSuggestions(suggestions);
            })
            .catch(() => {
                if (cancelled) return;
                setBookSuggestions([]);
            })
            .finally(() => {
                if (cancelled) return;
                setIsSuggestionsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [normalizedBookTitle, suggestionTypes]);

    return {
        wordQuery,
        setWordQuery,
        lookupWord,
        isWordLookupLoading,
        wordLookupError,
        wordInsight,
        bookSuggestions,
        isSuggestionsLoading,
        suggestionFilter,
        setSuggestionFilter,
    };
}
