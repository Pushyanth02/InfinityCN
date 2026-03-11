/**
 * ReaderFooter.tsx — Chapter Navigation Footer
 *
 * Displays previous/next navigation buttons, chapter position indicator,
 * and a reading progress bar.
 */

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReadingProgress, Book } from '../../types/cinematifier';

interface ReaderFooterProps {
    book: Book;
    currentChapterIndex: number;
    setCurrentChapter: (index: number) => void;
    readingProgress: ReadingProgress | null;
}

export const ReaderFooter: React.FC<ReaderFooterProps> = ({
    book,
    currentChapterIndex,
    setCurrentChapter,
    readingProgress,
}) => {
    const canGoPrev = currentChapterIndex > 0;
    const canGoNext = currentChapterIndex < book.chapters.length - 1;

    return (
        <footer className="cine-footer">
            <button
                className="cine-nav-btn"
                onClick={() => setCurrentChapter(currentChapterIndex - 1)}
                disabled={!canGoPrev}
            >
                <ChevronLeft size={24} />
                <span>Previous</span>
            </button>

            <div className="cine-progress">
                <span>
                    {currentChapterIndex + 1} / {book.chapters.length}
                    {readingProgress && readingProgress.readChapters.length > 0 && (
                        <span
                            style={{
                                marginLeft: '0.5rem',
                                color: 'var(--cine-gold)',
                                fontSize: '0.625rem',
                            }}
                        >
                            {readingProgress.readChapters.length} read
                        </span>
                    )}
                </span>
                <div className="cine-progress-bar">
                    <div
                        className="cine-progress-fill"
                        style={{
                            width: `${((readingProgress?.readChapters.length || 0) / book.chapters.length) * 100}%`,
                        }}
                    />
                </div>
            </div>

            <button
                className="cine-nav-btn"
                onClick={() => setCurrentChapter(currentChapterIndex + 1)}
                disabled={!canGoNext}
            >
                <span>Next</span>
                <ChevronRight size={24} />
            </button>
        </footer>
    );
};
