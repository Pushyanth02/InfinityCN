/**
 * ProcessingOverlay.tsx — Processing Status Overlay
 *
 * Displays a full-screen overlay with spinner, phase message,
 * progress bar, and an inspirational quote during document processing.
 */

import React from 'react';
import type { ProcessingProgress } from '../types/cinematifier';
import { getOfflineQuote } from '../lib/quotableApi';

interface ProcessingOverlayProps {
    progress: ProcessingProgress | null;
}

export const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({ progress }) => {
    if (!progress) return null;

    // Deterministic quote selection based on progress phase (stable across re-renders)
    const quote = getOfflineQuote(progress.message);

    return (
        <div className="cine-processing-overlay cine-fade-in" role="status" aria-live="polite">
            <div className="cine-processing-content">
                <div className="cine-processing-spinner" aria-hidden="true" />
                <p className="cine-processing-phase">{progress.message}</p>
                <div
                    className="cine-processing-bar"
                    role="progressbar"
                    aria-valuenow={progress.percentComplete}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Processing: ${progress.percentComplete}%`}
                >
                    <div
                        className="cine-processing-bar-fill"
                        style={{ width: `${progress.percentComplete}%` }}
                    />
                </div>
                <span className="cine-processing-percent">{progress.percentComplete}%</span>
                <blockquote className="cine-processing-quote">
                    <p>"{quote.content}"</p>
                    <footer>— {quote.author}</footer>
                </blockquote>
            </div>
        </div>
    );
};
