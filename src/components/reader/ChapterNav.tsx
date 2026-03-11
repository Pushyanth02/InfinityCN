/**
 * ChapterNav.tsx — Chapter Navigation Sidebar
 *
 * Slide-in navigation panel showing all chapters with bookmark
 * indicators and processing status.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BookmarkCheck, Sparkles } from 'lucide-react';
import type { Chapter } from '../../types/cinematifier';

export const ChapterNav = React.memo(function ChapterNav({
    chapters,
    currentIndex,
    bookmarks,
    onSelect,
    isOpen,
    onClose,
}: {
    chapters: Chapter[];
    currentIndex: number;
    bookmarks: number[];
    onSelect: (index: number) => void;
    isOpen: boolean;
    onClose: () => void;
}) {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        className="chapter-nav-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />
                    <motion.nav
                        className="chapter-nav"
                        initial={{ x: -300, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -300, opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    >
                        <div className="chapter-nav-header">
                            <h3>Chapters</h3>
                            <button onClick={onClose} className="chapter-nav-close">
                                <X size={20} />
                            </button>
                        </div>
                        <ul className="chapter-nav-list">
                            {chapters.map((chapter, i) => (
                                <li key={chapter.id}>
                                    <button
                                        className={`chapter-nav-item ${i === currentIndex ? 'active' : ''}`}
                                        onClick={() => {
                                            onSelect(i);
                                            onClose();
                                        }}
                                    >
                                        <span className="chapter-nav-number">{chapter.number}</span>
                                        <span className="chapter-nav-title">{chapter.title}</span>
                                        {bookmarks.includes(i) && (
                                            <BookmarkCheck
                                                size={14}
                                                className="chapter-nav-bookmark"
                                            />
                                        )}
                                        {chapter.isProcessed && (
                                            <Sparkles size={14} className="chapter-nav-processed" />
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </motion.nav>
                </>
            )}
        </AnimatePresence>
    );
});
