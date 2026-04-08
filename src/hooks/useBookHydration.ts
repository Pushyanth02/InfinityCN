/**
 * useBookHydration — IndexedDB book hydration hook
 *
 * Loads the most recently saved book from IndexedDB on mount.
 * Extracted from CinematifierApp.
 */

import { useEffect } from 'react';
import { useCinematifierStore } from '../store/cinematifierStore';
import { loadLatestBook } from '../lib/runtime/cinematifierDb';

export function useBookHydration() {
    const book = useCinematifierStore(s => s.book);
    const setBook = useCinematifierStore(s => s.setBook);

    useEffect(() => {
        if (!book) {
            loadLatestBook()
                .then(stored => {
                    if (stored) setBook(stored);
                })
                .catch(() => {
                    /* IndexedDB unavailable */
                });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: loads once, setBook is stable (Zustand selector)
    }, []);
}
