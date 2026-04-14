/**
 * ReaderFooter.tsx — Chapter Navigation Footer
 */
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReadingProgress, Book } from '../../types/cinematifier';
import { Scrubber } from '../ui/Scrubber';

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

    const progressPercent =
        ((readingProgress?.readChapters.length || 0) / book.chapters.length) * 100;

    return (
        <footer className="cine-footer" aria-label="Chapter navigation">
            <button
                type="button"
                className="cine-btn cine-btn--ghost cine-footer-btn"
                onClick={() => setCurrentChapter(currentChapterIndex - 1)}
                disabled={!canGoPrev}
            >
                <ChevronLeft size={20} style={{ marginRight: '8px' }} />
                Previous
            </button>

            <div className="cine-footer-progress-wrap">
                <div className="cine-footer-progress-row">
                    <span className="typography-label">
                        {currentChapterIndex + 1} / {book.chapters.length}
                    </span>
                    {readingProgress && readingProgress.readChapters.length > 0 && (
                        <span className="typography-label cine-footer-read-count">
                            {readingProgress.readChapters.length} read
                        </span>
                    )}
                </div>
                <Scrubber progress={progressPercent} />
            </div>

            <button
                type="button"
                className="cine-btn cine-btn--ghost cine-footer-btn"
                onClick={() => setCurrentChapter(currentChapterIndex + 1)}
                disabled={!canGoNext}
            >
                Next
                <ChevronRight size={20} style={{ marginLeft: '8px' }} />
            </button>
        </footer>
    );
};
