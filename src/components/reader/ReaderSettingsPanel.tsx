/**
 * ReaderSettingsPanel.tsx — Reader Settings Dropdown
 *
 * Cinematic Editorial glassmorphic settings panel that slides
 * down from the reader header. Controls font size, line spacing,
 * immersion level, dyslexia font, dark/light theme, and AI provider display.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Minus, Plus, Moon, Sun, BookmarkCheck } from 'lucide-react';
import type { ImmersionLevel } from '../../types/cinematifier';

interface ReaderSettingsPanelProps {
    fontSize: number;
    setFontSize: (size: number) => void;
    lineSpacing: number;
    setLineSpacing: (spacing: number) => void;
    immersionLevel: ImmersionLevel;
    setImmersionLevel: (level: ImmersionLevel) => void;
    dyslexiaFont: boolean;
    toggleDyslexiaFont: () => void;
    darkMode: boolean;
    toggleDarkMode: () => void;
    aiProvider: string;
    bookmarkCount: number;
}

export const ReaderSettingsPanel: React.FC<ReaderSettingsPanelProps> = ({
    fontSize,
    setFontSize,
    lineSpacing,
    setLineSpacing,
    immersionLevel,
    setImmersionLevel,
    dyslexiaFont,
    toggleDyslexiaFont,
    darkMode,
    toggleDarkMode,
    aiProvider,
    bookmarkCount,
}) => {
    return (
        <motion.div
            className="cine-settings-overlay"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
        >
            {/* Typography Section */}
            <div className="cine-settings-section">
                <h4 className="cine-settings-section-title">Typography</h4>

                <div className="cine-setting-row">
                    <span className="cine-setting-label">Font Size</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                            className="cine-btn--icon"
                            onClick={() => setFontSize(Math.max(12, fontSize - 1))}
                            aria-label="Decrease font size"
                        >
                            <Minus size={14} />
                        </button>
                        <span className="cine-setting-value">{fontSize}px</span>
                        <button
                            className="cine-btn--icon"
                            onClick={() => setFontSize(Math.min(32, fontSize + 1))}
                            aria-label="Increase font size"
                        >
                            <Plus size={14} />
                        </button>
                    </div>
                </div>

                <div className="cine-setting-row">
                    <span className="cine-setting-label">Line Spacing</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                            className="cine-btn--icon"
                            onClick={() => setLineSpacing(Math.max(1, +(lineSpacing - 0.1).toFixed(1)))}
                            aria-label="Decrease line spacing"
                        >
                            <Minus size={14} />
                        </button>
                        <span className="cine-setting-value">{lineSpacing.toFixed(1)}</span>
                        <button
                            className="cine-btn--icon"
                            onClick={() => setLineSpacing(Math.min(3, +(lineSpacing + 0.1).toFixed(1)))}
                            aria-label="Increase line spacing"
                        >
                            <Plus size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Immersion Section */}
            <div className="cine-settings-section">
                <h4 className="cine-settings-section-title">Immersion</h4>
                <div className="cine-immersion-segment">
                    {(['minimal', 'balanced', 'cinematic'] as const).map(level => (
                        <button
                            key={level}
                            className={`cine-immersion-btn ${immersionLevel === level ? 'active' : ''}`}
                            onClick={() => setImmersionLevel(level)}
                        >
                            {level.charAt(0).toUpperCase() + level.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Appearance Section */}
            <div className="cine-settings-section">
                <h4 className="cine-settings-section-title">Appearance</h4>

                <div className="cine-setting-row">
                    <span className="cine-setting-label">Theme</span>
                    <button
                        className="cine-btn cine-btn--sm"
                        onClick={toggleDarkMode}
                        style={{ gap: '6px' }}
                    >
                        {darkMode ? <Moon size={14} /> : <Sun size={14} />}
                        {darkMode ? 'Theater' : 'Library'}
                    </button>
                </div>

                <div className="cine-setting-row">
                    <span className="cine-setting-label">Dyslexia Font</span>
                    <button
                        className={`cine-btn cine-btn--sm ${dyslexiaFont ? 'cine-btn--primary' : ''}`}
                        onClick={toggleDyslexiaFont}
                    >
                        {dyslexiaFont ? 'On' : 'Off'}
                    </button>
                </div>
            </div>

            {/* Info Section */}
            <div className="cine-settings-section">
                <h4 className="cine-settings-section-title">Info</h4>

                <div className="cine-setting-row">
                    <span className="cine-setting-label">AI Provider</span>
                    <span className="cine-ai-provider-label">
                        {aiProvider === 'none' ? 'Offline' : aiProvider}
                    </span>
                </div>

                {bookmarkCount > 0 && (
                    <div className="cine-setting-row">
                        <span className="cine-setting-label">Bookmarks</span>
                        <span className="cine-bookmark-badge">
                            <BookmarkCheck size={12} />
                            {bookmarkCount}
                        </span>
                    </div>
                )}
            </div>
        </motion.div>
    );
};
