/**
 * ChapterNav.tsx — Chapter Navigation Sidebar
 *
 * Slide-in navigation panel showing all chapters with bookmark
 * indicators and processing status.
 */

import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BookmarkCheck, Sparkles } from 'lucide-react';
import type { Chapter } from '../../types/cinematifier';

function ChapterNav({
    chapters,
    currentIndex,
    bookmarks,
    onSelect,
    isOpen,
    onClose,
    triggerRef,
}: {
    chapters: Chapter[];
    currentIndex: number;
    bookmarks: number[];
    onSelect: (index: number) => void;
    isOpen: boolean;
    onClose: () => void;
    triggerRef?: React.RefObject<HTMLElement | null>;
}) {
    const navRef = useRef<HTMLDivElement>(null);
    // Focus trap and restore
    useEffect(() => {
        if (isOpen && navRef.current) {
            const focusable = navRef.current.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (focusable.length) focusable[0].focus();
            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    onClose();
                } else if (e.key === 'Tab') {
                    // Focus trap
                    const first = focusable[0];
                    const last = focusable[focusable.length - 1];
                    if (e.shiftKey) {
                        if (document.activeElement === first) {
                            e.preventDefault();
                            last.focus();
                        }
                    } else {
                        if (document.activeElement === last) {
                            e.preventDefault();
                            first.focus();
                        }
                    }
                }
            };
            const node = navRef.current;
            node?.addEventListener('keydown', handleKeyDown);
            return () => node?.removeEventListener('keydown', handleKeyDown);
        } else if (!isOpen && triggerRef?.current) {
            triggerRef.current.focus();
        }
    }, [isOpen, onClose, triggerRef]);
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
                        ref={navRef}
                        initial={{ x: -300, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -300, opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="chapter-nav-title"
                        tabIndex={-1}
                    >
                        <div className="chapter-nav-header">
                            <h3 id="chapter-nav-title">Chapters</h3>
                            <button onClick={onClose} className="chapter-nav-close" aria-label="Close chapter navigation">
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
}

export default ChapterNav;
