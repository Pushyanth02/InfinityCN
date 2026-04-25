/**
 * ReaderHeader.tsx — Reader Header Bar Component
 *
 * Contains the mode toggle (Original/Cinematic), ambient sound controls,
 * auto-scroll, bookmark, download, settings, and close buttons.
 */

import React from 'react';
import {
    X,
    Film,
    BookOpen,
    Settings,
    Volume2,
    List,
    Bookmark,
    BookmarkCheck,
    Play,
    Square,
    Download,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';
import type { ReaderMode, Book } from '../../types/cinematifier';

// Delay before revoking blob URLs to give the browser time to start the download
const DOWNLOAD_REVOKE_DELAY_MS = 1000;

interface ReaderHeaderProps {
    book: Book;
    readerMode: ReaderMode;
    setReaderMode: (mode: ReaderMode) => void;
    isBookmarked: boolean;
    currentChapterIndex: number;
    toggleBookmark: (chapterIndex: number) => void;
    isAmbientSoundEnabled: boolean;
    onToggleAmbientSound: () => void;
    isAutoScrolling: boolean;
    onToggleAutoScroll: () => void;
    isChapterSidebarOpen: boolean;
    onToggleChapterSidebar: () => void;
    isInsightsSidebarOpen: boolean;
    onToggleInsightsSidebar: () => void;
    onToggleSettings: () => void;
    onShowChapterNav: () => void;
    onClose: () => void;
}

interface ReaderHeaderWithRefProps extends ReaderHeaderProps {
    chapterNavTriggerRef?: React.RefObject<HTMLButtonElement | null>;
    isHidden?: boolean;
}

export const ReaderHeader: React.FC<ReaderHeaderWithRefProps> = ({
    book,
    readerMode,
    setReaderMode,
    isBookmarked,
    currentChapterIndex,
    toggleBookmark,
    isAmbientSoundEnabled,
    onToggleAmbientSound,
    isAutoScrolling,
    onToggleAutoScroll,
    isChapterSidebarOpen,
    onToggleChapterSidebar,
    isInsightsSidebarOpen,
    onToggleInsightsSidebar,
    onToggleSettings,
    onShowChapterNav,
    onClose,
    chapterNavTriggerRef,
    isHidden = false,
}) => {
    const handleDownload = () => {
        const text = book.chapters
            .map(c => `Chapter ${c.number}: ${c.title}\n\n${c.originalModeText ?? c.originalText}`)
            .join('\n\n\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${book.title}_Original_Text.txt`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_REVOKE_DELAY_MS);
    };

    return (
        <header className={`cine-header ${isHidden ? 'cine-header--hidden' : ''}`}>
            <div className="cine-header-left">
                <button
                    className="cine-btn--icon cine-header-action"
                    onClick={onShowChapterNav}
                    title="Chapter list"
                    aria-label="Chapter list"
                    ref={chapterNavTriggerRef}
                >
                    <List size={20} strokeWidth={2} />
                </button>
                <div className="cine-header-book-info">
                    <h1 className="cine-header-book-title">{book.title}</h1>
                    <span className="cine-header-chapter">Chapter {book.chapters[currentChapterIndex]?.number}</span>
                </div>
            </div>

            <div className="cine-header-center">
                <div className="cine-mode-segment" role="group" aria-label="Reading mode">
                    <button
                        className={`cine-mode-btn ${readerMode === 'original' ? 'active' : ''}`}
                        onClick={() => setReaderMode('original')}
                        aria-pressed={readerMode === 'original'}
                    >
                        <BookOpen size={14} strokeWidth={2} />
                        <span>Original</span>
                    </button>
                    <button
                        className={`cine-mode-btn ${readerMode === 'cinematified' ? 'active' : ''}`}
                        onClick={() => setReaderMode('cinematified')}
                        aria-pressed={readerMode === 'cinematified'}
                    >
                        <Film size={14} strokeWidth={2} />
                        <span>Cinematized</span>
                    </button>
                </div>
            </div>

            <div className="cine-header-right">
                <button
                    className={`cine-btn--icon cine-header-action cine-sidebar-toggle cine-sidebar-toggle--chapter ${isChapterSidebarOpen ? 'cine-btn--active' : ''}`}
                    onClick={onToggleChapterSidebar}
                    title={isChapterSidebarOpen ? 'Hide chapter sidebar' : 'Show chapter sidebar'}
                    aria-label={
                        isChapterSidebarOpen ? 'Hide chapter sidebar' : 'Show chapter sidebar'
                    }
                    aria-pressed={isChapterSidebarOpen}
                >
                    {isChapterSidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
                </button>
                <button
                    className={`cine-btn--icon cine-header-action cine-sidebar-toggle cine-sidebar-toggle--insights ${isInsightsSidebarOpen ? 'cine-btn--active' : ''}`}
                    onClick={onToggleInsightsSidebar}
                    title={isInsightsSidebarOpen ? 'Hide insights sidebar' : 'Show insights sidebar'}
                    aria-label={
                        isInsightsSidebarOpen ? 'Hide insights sidebar' : 'Show insights sidebar'
                    }
                    aria-pressed={isInsightsSidebarOpen}
                >
                    {isInsightsSidebarOpen ? (
                        <ChevronRight size={18} />
                    ) : (
                        <ChevronLeft size={18} />
                    )}
                </button>
                <button
                    className={`cine-btn--icon cine-header-action ${isAmbientSoundEnabled ? 'cine-btn--active' : ''}`}
                    onClick={onToggleAmbientSound}
                    title={isAmbientSoundEnabled ? 'Disable Ambient Sound' : 'Enable Ambient Sound'}
                    aria-label={
                        isAmbientSoundEnabled ? 'Disable Ambient Sound' : 'Enable Ambient Sound'
                    }
                >
                    <Volume2
                        size={18}
                        color={isAmbientSoundEnabled ? 'var(--primary)' : undefined}
                    />
                </button>
                <button
                    className={`cine-btn--icon cine-header-action ${isAutoScrolling ? 'cine-btn--active' : ''}`}
                    onClick={onToggleAutoScroll}
                    title={isAutoScrolling ? 'Stop Auto-Scroll' : 'Start Auto-Scroll'}
                    aria-label={isAutoScrolling ? 'Stop Auto-Scroll' : 'Start Auto-Scroll'}
                >
                    {isAutoScrolling ? (
                        <Square size={18} color="var(--cine-red)" />
                    ) : (
                        <Play size={18} />
                    )}
                </button>
                <button
                    className={`cine-btn--icon cine-header-action ${isBookmarked ? 'cine-btn--bookmarked' : ''}`}
                    onClick={() => toggleBookmark(currentChapterIndex)}
                    title={isBookmarked ? 'Remove bookmark' : 'Bookmark chapter'}
                    aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark chapter'}
                >
                    {isBookmarked ? <BookmarkCheck size={18} color="var(--primary)" /> : <Bookmark size={18} />}
                </button>
                <button
                    className="cine-btn--icon cine-header-action"
                    onClick={handleDownload}
                    title="Export Original Text"
                    aria-label="Export Original Text"
                >
                    <Download size={18} />
                </button>
                <button
                    className="cine-btn--icon cine-header-action"
                    onClick={onToggleSettings}
                    title="Settings"
                    aria-label="Settings"
                >
                    <Settings size={18} />
                </button>
                <button
                    className="cine-back-btn"
                    onClick={onClose}
                    title="Close"
                    aria-label="Close reader"
                >
                    <X size={18} />
                    Close
                </button>
            </div>
        </header>
    );
};
