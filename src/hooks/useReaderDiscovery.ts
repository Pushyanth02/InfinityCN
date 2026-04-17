import { useCallback, useEffect, useRef, useState } from 'react';
import {
    lookupReaderWordInsight,
    searchReaderWordCompletions,
    type ReaderWordInsight,
} from '../lib/runtime/readerApis';

const MIN_WORD_LOOKUP_LENGTH = 2;
const AUTO_LOOKUP_DEBOUNCE_MS = 360;
const SUGGESTION_DEBOUNCE_MS = 140;
const MAX_RECENT_WORDS = 8;

interface UseReaderDiscoveryResult {
    wordQuery: string;
    setWordQuery: (value: string) => void;
    lookupWord: (explicitWord?: string) => Promise<void>;
    isWordLookupLoading: boolean;
    wordLookupError: string | null;
    wordInsight: ReaderWordInsight | null;
    wordSuggestions: string[];
    recentWords: string[];
}

function normalizeLookupToken(value: string): string {
    return value.trim().toLowerCase();
}

export function useReaderDiscovery(): UseReaderDiscoveryResult {
    const [wordQuery, setWordQueryState] = useState('');
    const [wordInsight, setWordInsight] = useState<ReaderWordInsight | null>(null);
    const [wordLookupError, setWordLookupError] = useState<string | null>(null);
    const [isWordLookupLoading, setIsWordLookupLoading] = useState(false);
    const [wordSuggestions, setWordSuggestions] = useState<string[]>([]);
    const [recentWords, setRecentWords] = useState<string[]>([]);

    const queryRef = useRef(wordQuery);
    const requestTokenRef = useRef(0);

    useEffect(() => {
        queryRef.current = wordQuery;
    }, [wordQuery]);

    const setWordQuery = useCallback((value: string) => {
        setWordQueryState(value);
        if (!value.trim()) {
            setWordLookupError(null);
            setWordSuggestions([]);
        }
    }, []);

    const rememberWord = useCallback((value: string) => {
        const normalized = value.trim();
        if (!normalized) return;

        setRecentWords(previous => {
            const next = [
                normalized,
                ...previous.filter(word => normalizeLookupToken(word) !== normalizeLookupToken(normalized)),
            ];
            return next.slice(0, MAX_RECENT_WORDS);
        });
    }, []);

    const runLookup = useCallback(
        async (rawWord: string, mode: 'manual' | 'auto') => {
            const requestedWord = rawWord.trim();
            if (requestedWord.length < MIN_WORD_LOOKUP_LENGTH) {
                if (mode === 'manual') {
                    setWordLookupError('Type at least 2 letters to look up a word.');
                }
                return;
            }

            const requestToken = ++requestTokenRef.current;
            setIsWordLookupLoading(true);
            if (mode === 'manual') {
                setWordLookupError(null);
            }

            try {
                const result = await lookupReaderWordInsight(requestedWord);
                if (requestToken !== requestTokenRef.current) {
                    return;
                }

                if (!result) {
                    if (mode === 'manual') {
                        setWordLookupError('No lexical data found for that word.');
                    }
                    return;
                }

                setWordInsight(result);
                setWordLookupError(null);
                rememberWord(result.word);
            } catch {
                if (requestToken !== requestTokenRef.current) {
                    return;
                }

                if (mode === 'manual') {
                    setWordLookupError('Word lookup failed. Try again in a moment.');
                }
            } finally {
                if (requestToken === requestTokenRef.current) {
                    setIsWordLookupLoading(false);
                }
            }
        },
        [rememberWord],
    );

    const lookupWord = useCallback(
        async (explicitWord?: string) => {
            await runLookup(explicitWord ?? queryRef.current, 'manual');
        },
        [runLookup],
    );

    useEffect(() => {
        const requestedWord = wordQuery.trim();
        if (requestedWord.length < MIN_WORD_LOOKUP_LENGTH) {
            return;
        }

        let cancelled = false;
        const timer = window.setTimeout(() => {
            void (async () => {
                const suggestions = await searchReaderWordCompletions(requestedWord);
                if (cancelled) {
                    return;
                }

                setWordSuggestions(suggestions);
            })();
        }, SUGGESTION_DEBOUNCE_MS);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [wordQuery]);

    useEffect(() => {
        const requestedWord = wordQuery.trim();
        if (requestedWord.length < MIN_WORD_LOOKUP_LENGTH) {
            return;
        }

        if (normalizeLookupToken(wordInsight?.word ?? '') === normalizeLookupToken(requestedWord)) {
            return;
        }

        const timer = window.setTimeout(() => {
            void runLookup(requestedWord, 'auto');
        }, AUTO_LOOKUP_DEBOUNCE_MS);

        return () => {
            window.clearTimeout(timer);
        };
    }, [wordInsight?.word, wordQuery, runLookup]);

    const visibleWordSuggestions =
        wordQuery.trim().length < MIN_WORD_LOOKUP_LENGTH ? [] : wordSuggestions;

    return {
        wordQuery,
        setWordQuery,
        lookupWord,
        isWordLookupLoading,
        wordLookupError,
        wordInsight,
        wordSuggestions: visibleWordSuggestions,
        recentWords,
    };
}
