import React from 'react';
import { BookmarkCheck, Sparkles } from 'lucide-react';
import type { Chapter } from '../../types/cinematifier';

interface ReaderChapterSidebarProps {
    chapters: Chapter[];
    currentChapterIndex: number;
    bookmarks: number[];
    onSelectChapter: (index: number) => void;
}

export const ReaderChapterSidebar: React.FC<ReaderChapterSidebarProps> = ({
    chapters,
    currentChapterIndex,
    bookmarks,
    onSelectChapter,
}) => {
    return (
        <aside className="cine-chapter-nav-sidebar" aria-label="Chapter navigation">
            <div className="cine-chapter-nav-header">
                <h3 className="cine-chapter-nav-title">Chapters</h3>
            </div>
            <div className="cine-chapter-list">
                {chapters.map((chapter, i) => (
                    <button
                        key={chapter.id}
                        className={`cine-chapter-item ${i === currentChapterIndex ? 'cine-chapter-item--active' : ''}`}
                        onClick={() => onSelectChapter(i)}
                    >
                        <span className="cine-chapter-item-number">Chapter {chapter.number}</span>
                        <span className="cine-chapter-item-title">{chapter.title}</span>
                        <span className="cine-chapter-item-meta">
                            {bookmarks.includes(i) && <BookmarkCheck size={12} />}
                            {chapter.isProcessed && <Sparkles size={12} />}
                            {chapter.estimatedReadTime} min
                        </span>
                    </button>
                ))}
            </div>
        </aside>
    );
};
