/**
 * CinematifierApp.tsx — Main Application Component
 *
 * Handles the full flow: Document Upload → Processing → Reading
 *
 * Custom hooks (extracted to src/hooks/):
 *   - useBookHydration   — IndexedDB book hydration on mount
 *   - useFileProcessing  — Text extraction + chapter segmentation + cinematification
 *
 * Sub-components extracted to separate files:
 *   - UploadZone.tsx        — Drag-drop file upload
 *   - ProcessingOverlay.tsx — Processing status overlay
 */

import React, { useState, useCallback, lazy, Suspense } from 'react';
import { Film, Settings, X, Sparkles, AlertCircle, Moon, Sun } from 'lucide-react';
import { useCinematifierStore } from '../store/cinematifierStore';
import { useBookHydration, useFileProcessing } from '../hooks';

// Extracted sub-components
import { UploadZone } from './UploadZone';
import { ProcessingOverlay } from './ProcessingOverlay';

// Lazy load components
const CinematicReader = lazy(() =>
    import('./CinematicReader').then(m => ({ default: m.CinematicReader })),
);
const CinematifierSettings = lazy(() =>
    import('./CinematifierSettings').then(m => ({ default: m.CinematifierSettings })),
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

    // Hydrate book from IndexedDB on mount
    useBookHydration();

    // File processing pipeline
    const processFile = useFileProcessing(useCallback(() => setShowReader(true), []));

    // Close reader and go back to home
    const handleCloseReader = useCallback(() => {
        setShowReader(false);
    }, []);

    // Continue reading existing book
    const handleContinueReading = useCallback(() => {
        if (book) {
            setShowReader(true);
        }
    }, [book]);

    // Start fresh
    const handleNewBook = useCallback(() => {
        reset();
    }, [reset]);

    return (
        <div className={`cinematifier-app ${!darkMode ? 'cinematifier-app--light' : ''}`}>
            {/* Reader View */}
            {showReader && book && (
                <Suspense
                    fallback={
                        <div className="cine-reader cine-reader--empty">
                            <div className="cine-processing-spinner" />
                        </div>
                    }
                >
                    <CinematicReader onClose={handleCloseReader} />
                </Suspense>
            )}

            {/* Home View */}
            {!showReader && (
                <div className="cine-home">
                    {/* Header */}
                    <header className="cine-home-header">
                        <div className="cine-logo">
                            <Film size={32} />
                            <span className="cine-logo-text">Cinematifier</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                className="cine-btn cine-btn--icon"
                                onClick={toggleDarkMode}
                                title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                                aria-label={
                                    darkMode ? 'Switch to light mode' : 'Switch to dark mode'
                                }
                            >
                                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                            </button>
                            <button
                                className="cine-btn cine-btn--icon"
                                onClick={() => setShowSettings(true)}
                                title="AI Settings"
                                aria-label="AI Settings"
                            >
                                <Settings size={20} />
                            </button>
                        </div>
                    </header>

                    {/* Main Content */}
                    <main className="cine-home-content">
                        <div className="cine-home-hero">
                            <h1>Transform Novels into Cinematic Experiences</h1>
                            <p>
                                Upload a novel and watch it come alive with dramatic SFX, cinematic
                                transitions, and screenplay-style formatting. AI-powered
                                transformation for an immersive reading experience.
                            </p>
                        </div>

                        {/* Show existing novel option or upload */}
                        {book && !isProcessing && (
                            <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
                                <p
                                    style={{
                                        color: 'var(--cine-text-secondary)',
                                        marginBottom: '1rem',
                                    }}
                                >
                                    Continue reading <strong>{book.title}</strong>?
                                </p>
                                <div
                                    style={{
                                        display: 'flex',
                                        gap: '1rem',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <button
                                        className="cine-btn cine-btn--primary"
                                        onClick={handleContinueReading}
                                    >
                                        <Sparkles size={16} />
                                        Continue Reading
                                    </button>
                                    <button className="cine-btn" onClick={handleNewBook}>
                                        New Book
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Upload Zone */}
                        {(!book || isProcessing) && (
                            <UploadZone onFileSelect={processFile} isProcessing={isProcessing} />
                        )}

                        {/* Error Display */}
                        {error && (
                            <div className="cine-error cine-fade-in" role="alert">
                                <AlertCircle size={24} aria-hidden="true" />
                                <p className="cine-error-text">{error}</p>
                                <button className="cine-btn" onClick={() => setError(null)}>
                                    Dismiss
                                </button>
                            </div>
                        )}

                        {/* AI Provider Status */}
                        <div
                            style={{
                                marginTop: '2rem',
                                textAlign: 'center',
                                color: 'var(--cine-text-muted)',
                                fontSize: '0.875rem',
                            }}
                        >
                            AI: {aiProvider === 'none' ? 'Offline mode' : aiProvider}
                            {aiProvider === 'none' && (
                                <span style={{ display: 'block', marginTop: '0.25rem' }}>
                                    Click settings to configure an AI provider for enhanced results
                                </span>
                            )}
                        </div>
                    </main>
                </div>
            )}

            {/* Processing Overlay */}
            {isProcessing && <ProcessingOverlay progress={processingProgress} />}

            {/* AI Settings Modal */}
            {showSettings && (
                <div
                    className="cine-settings-modal-backdrop cine-fade-in"
                    onClick={() => setShowSettings(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0.8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 200,
                    }}
                >
                    <div
                        className="cine-fade-in"
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: 'var(--cine-bg-secondary)',
                            borderRadius: '12px',
                            padding: '1.5rem',
                            maxWidth: '500px',
                            width: '90%',
                            maxHeight: '80vh',
                            overflow: 'auto',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '1rem',
                            }}
                        >
                            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>AI Settings</h2>
                            <button
                                className="cine-btn cine-btn--icon"
                                onClick={() => setShowSettings(false)}
                                aria-label="Close settings"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <Suspense fallback={<div>Loading...</div>}>
                            <CinematifierSettings onClose={() => setShowSettings(false)} />
                        </Suspense>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CinematifierApp;
