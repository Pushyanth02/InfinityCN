/**
 * CinematifierApp.tsx — Main Application Component
 *
 * Cinematic Editorial design — "The Theater" (dark) / "The Library" (light).
 * Velvet Noir design system applied throughout.
 */

import React, { useState, useCallback, lazy, Suspense } from 'react';
import { Film, Settings, X, Sparkles, AlertCircle, Moon, Sun, BookOpen } from 'lucide-react';
import { useCinematifierStore } from '../store/cinematifierStore';
import { useBookHydration, useFileProcessing } from '../hooks';

// Extracted sub-components
import { UploadZone } from './UploadZone';
import { ProcessingOverlay } from './ProcessingOverlay';
import { Button } from './ui/Button';

// Lazy load components
const CinematicReader = lazy(() =>
    import('./CinematicReader').then(m => ({ default: m.CinematicReader })),
);
const CinematifierSettings = lazy(() =>
    import('./CinematifierSettings').then(m => ({ default: m.default })),
);

// ─── Main App Component ────────────────────────────────────

export const CinematifierApp: React.FC = () => {
    const book = useCinematifierStore(s => s.book);
    const isProcessing = useCinematifierStore(s => s.isProcessing);
    const processingProgress = useCinematifierStore(s => s.processingProgress);
    const error = useCinematifierStore(s => s.error);
    const aiProvider = useCinematifierStore(s => s.aiProvider);
    const darkMode = useCinematifierStore(s => s.darkMode);
    const setError = useCinematifierStore(s => s.setError);
    const toggleDarkMode = useCinematifierStore(s => s.toggleDarkMode);
    const reset = useCinematifierStore(s => s.reset);

    const [showSettings, setShowSettings] = useState(false);
    const [showReader, setShowReader] = useState(false);

    useBookHydration();
    const processFile = useFileProcessing(useCallback(() => setShowReader(true), []));

    const handleCloseReader = useCallback(() => setShowReader(false), []);
    const handleContinueReading = useCallback(() => { if (book) setShowReader(true); }, [book]);
    const handleNewBook = useCallback(() => reset(), [reset]);

    return (
        <div
            className={darkMode ? '' : 'theme-light'}
            style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--surface)', color: 'var(--on-surface)' }}
        >
            {/* Cinematic Reader View */}
            {showReader && book && (
                <Suspense fallback={
                    <div className="app-loading-screen">
                        <div className="app-loading-spinner" />
                    </div>
                }>
                    <CinematicReader onClose={handleCloseReader} />
                </Suspense>
            )}

            {/* Home / Landing View */}
            {!showReader && (
                <div className="cin-app-home">
                    {/* Ambient background glows */}
                    <div className="cin-hero-glow cin-hero-glow--1" aria-hidden="true" />
                    <div className="cin-hero-glow cin-hero-glow--2" aria-hidden="true" />

                    {/* ── Header ── */}
                    <header className="cin-header" role="banner">
                        <a href="#main-content" className="skip-to-content">Skip to main content</a>

                        <div className="cin-header-brand">
                            <Film size={28} color="var(--primary)" strokeWidth={1.5} aria-hidden="true" />
                            <span className="cin-brand-name">Cinematifier</span>
                        </div>

                        {book && !isProcessing && (
                            <nav className="cin-header-nav" aria-label="Primary navigation">
                                <button className="cin-nav-link" onClick={handleContinueReading}>
                                    <BookOpen size={16} aria-hidden="true" />
                                    Library
                                </button>
                            </nav>
                        )}

                        <div className="cin-header-actions">
                            <span className="cin-ai-badge">
                                <span className="cin-ai-badge-dot" aria-hidden="true" />
                                {aiProvider === 'none' ? 'Offline' : aiProvider}
                            </span>
                            <button
                                className="cin-icon-btn"
                                onClick={toggleDarkMode}
                                title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                                aria-label={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                            >
                                {darkMode ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
                            </button>
                            <button
                                className="cin-icon-btn"
                                onClick={() => setShowSettings(true)}
                                title="AI Engine Settings"
                                aria-label="Open AI Engine Settings"
                            >
                                <Settings size={18} strokeWidth={1.5} />
                            </button>
                        </div>
                    </header>

                    {/* ── Hero ── */}
                    <main id="main-content" role="main" className="cin-hero">
                        <div className="cin-hero-content">
                            {/* Eyebrow label */}
                            <div className="cin-eyebrow">
                                <Sparkles size={12} aria-hidden="true" />
                                AI-Powered Narrative Engine
                            </div>

                            {/* Main headline */}
                            <h1 className="cin-hero-title">
                                Transform Novels<br />
                                <em>into Cinema</em>
                            </h1>

                            <p className="cin-hero-subtitle">
                                Upload any novel PDF and watch it transform into a breathtaking
                                cinematic reading experience — with dramatic SFX, emotional arcs,
                                and screenplay-style formatting.
                            </p>

                            {/* Continue Reading CTA */}
                            {book && !isProcessing && (
                                <div className="cin-resume-card">
                                    <div className="cin-resume-card-info">
                                        <BookOpen size={18} color="var(--primary)" aria-hidden="true" />
                                        <div>
                                            <div className="cin-resume-label">Currently in Library</div>
                                            <div className="cin-resume-title">{book.title}</div>
                                        </div>
                                    </div>
                                    <div className="cin-resume-actions">
                                        <button className="cin-btn-primary" onClick={handleContinueReading}>
                                            <Sparkles size={15} aria-hidden="true" />
                                            Continue Reading
                                        </button>
                                        <button className="cin-btn-ghost" onClick={handleNewBook}>
                                            New Book
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Upload Panel ── */}
                        <div className="cin-upload-panel">
                            {(!book || isProcessing) && (
                                <UploadZone onFileSelect={processFile} isProcessing={isProcessing} />
                            )}
                            {book && !isProcessing && (
                                <div className="cin-change-book-panel">
                                    <p className="cin-change-book-label">Load a different manuscript</p>
                                    <UploadZone onFileSelect={processFile} isProcessing={isProcessing} compact />
                                </div>
                            )}

                            {/* Error */}
                            {error && (
                                <div className="cin-error-card" role="alert" aria-live="polite">
                                    <AlertCircle size={20} aria-hidden="true" />
                                    <p className="cin-error-message">{error}</p>
                                    <button
                                        className="cin-btn-ghost cin-btn-ghost--sm"
                                        onClick={() => setError(null)}
                                        aria-label="Dismiss error"
                                    >
                                        <X size={16} aria-hidden="true" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </main>

                    {/* ── Feature Strip ── */}
                    <section className="cin-features" aria-label="Key features">
                        {[
                            { icon: '🎬', label: 'Cinematic Blocks', desc: 'Dialogue, action, SFX, scene breaks' },
                            { icon: '🎭', label: 'Emotion Engine', desc: 'Real-time tension & emotion tracking' },
                            { icon: '📖', label: 'Dual Modes', desc: 'Original text or full cinematification' },
                            { icon: '🌒', label: 'Offline-First', desc: 'No cloud required, runs locally' },
                        ].map(f => (
                            <div key={f.label} className="cin-feature-tile">
                                <span className="cin-feature-icon" aria-hidden="true">{f.icon}</span>
                                <span className="cin-feature-label">{f.label}</span>
                                <span className="cin-feature-desc">{f.desc}</span>
                            </div>
                        ))}
                    </section>

                    {/* ── Footer ── */}
                    <footer className="cin-footer" role="contentinfo">
                        <span>InfinityCN · Cinematifier</span>
                        <span aria-hidden="true">·</span>
                        <span>Stories deserve a stage</span>
                    </footer>
                </div>
            )}

            {/* ── Processing Overlay ── */}
            {isProcessing && <ProcessingOverlay progress={processingProgress} />}

            {/* ── Settings Modal ── */}
            {showSettings && (
                <div
                    className="cin-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="settings-modal-title"
                    onClick={() => setShowSettings(false)}
                    onKeyDown={e => { if (e.key === 'Escape') setShowSettings(false); }}
                    tabIndex={-1}
                >
                    <div
                        className="cin-modal-card"
                        onClick={e => e.stopPropagation()}
                        tabIndex={0}
                    >
                        <div className="cin-modal-header">
                            <h2 id="settings-modal-title" className="cin-modal-title">Engine Configuration</h2>
                            <button
                                className="cin-icon-btn"
                                onClick={() => setShowSettings(false)}
                                aria-label="Close settings"
                            >
                                <X size={20} strokeWidth={1.5} />
                            </button>
                        </div>
                        <Suspense fallback={<div className="cin-modal-loading">Loading modules…</div>}>
                            <CinematifierSettings onClose={() => setShowSettings(false)} />
                        </Suspense>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CinematifierApp;
