/**
 * ReaderSettingsPanel.tsx — Reader Settings Dropdown
 *
 * Controls for font size, line spacing, immersion level, dyslexia font,
 * dark/light theme, and AI provider display.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Minus, Plus, Moon, Sun } from 'lucide-react';
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
            className="cine-settings"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
        >
            <div className="cine-settings-group">
                <label>Font Size</label>
                <div className="cine-settings-row">
                    <button
                        className="cine-btn cine-btn--sm"
                        onClick={() => setFontSize(fontSize - 2)}
                    >
                        <Minus size={14} />
                    </button>
                    <span className="cine-settings-value">{fontSize}px</span>
                    <button
                        className="cine-btn cine-btn--sm"
                        onClick={() => setFontSize(fontSize + 2)}
                    >
                        <Plus size={14} />
                    </button>
                </div>
            </div>
            <div className="cine-settings-group">
                <label>Line Spacing</label>
                <div className="cine-settings-row">
                    <button
                        className="cine-btn cine-btn--sm"
                        onClick={() => setLineSpacing(lineSpacing - 0.2)}
                    >
                        <Minus size={14} />
                    </button>
                    <span className="cine-settings-value">{lineSpacing.toFixed(1)}</span>
                    <button
                        className="cine-btn cine-btn--sm"
                        onClick={() => setLineSpacing(lineSpacing + 0.2)}
                    >
                        <Plus size={14} />
                    </button>
                </div>
            </div>
            <div className="cine-settings-group">
                <label>Immersion</label>
                <div className="cine-settings-row">
                    {(['minimal', 'balanced', 'cinematic'] as const).map(level => (
                        <button
                            key={level}
                            className={`cine-btn cine-btn--sm ${immersionLevel === level ? 'active' : ''}`}
                            onClick={() => setImmersionLevel(level)}
                        >
                            {level.charAt(0).toUpperCase() + level.slice(1)}
                        </button>
                    ))}
                </div>
            </div>
            <div className="cine-settings-group">
                <label>Dyslexia Font</label>
                <button
                    className={`cine-btn cine-btn--toggle ${dyslexiaFont ? 'active' : ''}`}
                    onClick={toggleDyslexiaFont}
                >
                    {dyslexiaFont ? 'On' : 'Off'}
                </button>
            </div>
            <div className="cine-settings-group">
                <label>Theme</label>
                <button
                    className={`cine-btn cine-btn--toggle ${darkMode ? 'active' : ''}`}
                    onClick={toggleDarkMode}
                >
                    {darkMode ? <Moon size={16} /> : <Sun size={16} />}
                    {darkMode ? 'Dark' : 'Light'}
                </button>
            </div>
            <div className="cine-settings-group">
                <label>AI Provider</label>
                <span className="cine-settings-value cine-settings-value--muted">
                    {aiProvider === 'none' ? 'Offline' : aiProvider}
                </span>
            </div>
            {bookmarkCount > 0 && (
                <div className="cine-settings-group">
                    <label>Bookmarks</label>
                    <span className="cine-settings-value cine-settings-value--muted">
                        {bookmarkCount} chapter{bookmarkCount !== 1 ? 's' : ''}
                    </span>
                </div>
            )}
        </motion.div>
    );
};
