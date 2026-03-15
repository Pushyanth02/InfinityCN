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
    onToggleSettings: () => void;
    onShowChapterNav: () => void;
    onClose: () => void;
}

export const ReaderHeader: React.FC<ReaderHeaderProps> = ({
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
    onToggleSettings,
    onShowChapterNav,
    onClose,
}) => {
    const handleDownload = () => {
        const text = book.chapters
            .map(c => `Chapter ${c.number}: ${c.title}\n\n${c.originalText}`)
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
        <header className="cine-header">
            <div className="cine-header-left">
                <button
                    className="cine-btn cine-btn--icon"
                    onClick={onShowChapterNav}
                    title="Chapter list"
                    aria-label="Chapter list"
                >
                    <List size={20} />
                </button>
                <h1 className="cine-title">{book.title}</h1>
            </div>

            <div className="cine-header-center">
                <div className="cine-mode-toggle">
                    <button
                        className={`cine-mode-btn ${readerMode === 'original' ? 'active' : ''}`}
                        onClick={() => setReaderMode('original')}
                    >
                        <BookOpen size={16} />
                        <span>Original</span>
                    </button>
                    <button
                        className={`cine-mode-btn ${readerMode === 'cinematified' ? 'active' : ''}`}
                        onClick={() => setReaderMode('cinematified')}
                    >
                        <Film size={16} />
                        <span>Cinematic</span>
                    </button>
                </div>
            </div>

            <div className="cine-header-right">
                <button
                    className={`cine-btn cine-btn--icon ${isAmbientSoundEnabled ? 'cine-btn--active' : ''}`}
                    onClick={onToggleAmbientSound}
                    title={isAmbientSoundEnabled ? 'Disable Ambient Sound' : 'Enable Ambient Sound'}
                    aria-label={
                        isAmbientSoundEnabled ? 'Disable Ambient Sound' : 'Enable Ambient Sound'
                    }
                >
                    <Volume2
                        size={20}
                        color={isAmbientSoundEnabled ? 'var(--cine-gold)' : undefined}
                    />
                </button>
                <button
                    className={`cine-btn cine-btn--icon ${isAutoScrolling ? 'cine-btn--active' : ''}`}
                    onClick={onToggleAutoScroll}
                    title={isAutoScrolling ? 'Stop Auto-Scroll' : 'Start Auto-Scroll'}
                    aria-label={isAutoScrolling ? 'Stop Auto-Scroll' : 'Start Auto-Scroll'}
                >
                    {isAutoScrolling ? (
                        <Square size={20} color="var(--cine-red)" />
                    ) : (
                        <Play size={20} />
                    )}
                </button>
                <button
                    className={`cine-btn cine-btn--icon ${isBookmarked ? 'cine-btn--bookmarked' : ''}`}
                    onClick={() => toggleBookmark(currentChapterIndex)}
                    title={isBookmarked ? 'Remove bookmark' : 'Bookmark chapter'}
                    aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark chapter'}
                >
                    {isBookmarked ? <BookmarkCheck size={20} /> : <Bookmark size={20} />}
                </button>
                <button
                    className="cine-btn cine-btn--icon"
                    onClick={handleDownload}
                    title="Export Original Text"
                    aria-label="Export Original Text"
                >
                    <Download size={20} />
                </button>
                <button
                    className="cine-btn cine-btn--icon"
                    onClick={onToggleSettings}
                    title="Settings"
                    aria-label="Settings"
                >
                    <Settings size={20} />
                </button>
                <button
                    className="cine-btn cine-btn--icon"
                    onClick={onClose}
                    title="Close"
                    aria-label="Close reader"
                >
                    <X size={20} />
                </button>
            </div>
        </header>
    );
};
