/**
 * useReadingProgress — Reading progress tracking hook
 *
 * Manages reading progress initialization, time tracking, and chapter marking.
 * Extracted from CinematicReader to reduce component complexity.
 */

import { useEffect, useRef } from 'react';
import { useCinematifierStore } from '../store/cinematifierStore';
import { saveReadingProgress, loadReadingProgress } from '../lib/cinematifierDb';
import { createReadingProgress } from '../lib/cinematifier';

export function useReadingProgress() {
    const book = useCinematifierStore(s => s.book);
    const currentChapterIndex = useCinematifierStore(s => s.currentChapterIndex);
    const readingProgress = useCinematifierStore(s => s.readingProgress);
    const setReadingProgress = useCinematifierStore(s => s.setReadingProgress);
    const updateReadingProgress = useCinematifierStore(s => s.updateReadingProgress);
    const markChapterRead = useCinematifierStore(s => s.markChapterRead);
    const addReadingTime = useCinematifierStore(s => s.addReadingTime);
    const toggleBookmark = useCinematifierStore(s => s.toggleBookmark);

    const readingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const bookmarks = readingProgress?.bookmarks ?? [];
    const isBookmarked = bookmarks.includes(currentChapterIndex);

    // Initialize reading progress on mount
    useEffect(() => {
        if (!book) return;
        if (readingProgress && readingProgress.bookId === book.id) return;

        loadReadingProgress(book.id)
            .then(stored => {
                if (stored) {
                    setReadingProgress(stored);
                    if (stored.currentChapter > 1) {
                        const idx = stored.currentChapter - 1;
                        if (idx < book.chapters.length) {
                            useCinematifierStore.getState().setCurrentChapter(idx);
                        }
                    }
                    if (stored.readingMode) {
                        useCinematifierStore.getState().setReaderMode(stored.readingMode);
                    }
                } else {
                    setReadingProgress(createReadingProgress(book.id));
                }
            })
            .catch(() => {
                setReadingProgress(createReadingProgress(book.id));
            });
    }, [book, readingProgress, setReadingProgress]);

    // Track reading time (increment every 30 seconds while reader is open)
    useEffect(() => {
        readingTimerRef.current = setInterval(() => {
            addReadingTime(30);
        }, 30_000);

        return () => {
            if (readingTimerRef.current) clearInterval(readingTimerRef.current);
            const progress = useCinematifierStore.getState().readingProgress;
            if (progress)
                saveReadingProgress(progress).catch(e => {
                    console.warn('[CinematicReader] Failed to persist reading progress:', e);
                });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: addReadingTime is stable (Zustand selector)
    }, []);

    // Track chapter changes in reading progress
    useEffect(() => {
        if (!readingProgress || !book) return;

        updateReadingProgress({ currentChapter: currentChapterIndex + 1 });
        const timer = setTimeout(() => {
            markChapterRead(currentChapterIndex + 1);
        }, 5_000);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- tracks chapter index only; Zustand actions are stable
    }, [currentChapterIndex]);

    return {
        readingProgress,
        bookmarks,
        isBookmarked,
        toggleBookmark,
    };
}
