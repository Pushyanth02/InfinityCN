/**
 * ReaderFooter.tsx — Chapter Navigation Footer
 */
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReadingProgress, Book } from '../../types/cinematifier';
import { Scrubber } from '../ui/Scrubber';
import { Button } from '../ui/Button';

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

    const progressPercent = ((readingProgress?.readChapters.length || 0) / book.chapters.length) * 100;

    return (
        <footer className="glass-panel ghost-border-bottom" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: 'var(--spacing-4) var(--spacing-8)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 50 }}>
            <Button
                variant="ghost"
                onClick={() => setCurrentChapter(currentChapterIndex - 1)}
                disabled={!canGoPrev}
            >
                <ChevronLeft size={20} style={{ marginRight: '8px' }} />
                Previous
            </Button>

            <div style={{ flexGrow: 1, maxWidth: '400px', margin: '0 var(--spacing-8)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="typography-label" style={{ color: 'var(--on-surface-variant)' }}>
                        {currentChapterIndex + 1} / {book.chapters.length}
                    </span>
                    {readingProgress && readingProgress.readChapters.length > 0 && (
                        <span className="typography-label" style={{ color: 'var(--secondary)' }}>
                            {readingProgress.readChapters.length} read
                        </span>
                    )}
                </div>
                <Scrubber progress={progressPercent} />
            </div>

            <Button
                variant="ghost"
                onClick={() => setCurrentChapter(currentChapterIndex + 1)}
                disabled={!canGoNext}
            >
                Next
                <ChevronRight size={20} style={{ marginLeft: '8px' }} />
            </Button>
        </footer>
    );
};

