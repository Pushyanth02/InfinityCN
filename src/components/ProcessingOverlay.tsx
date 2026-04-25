/**
 * ProcessingOverlay.tsx — Cinematic book processing screen
 *
 * Velvet Noir design system — "upload_processing_dark" reference.
 * Full-screen glass overlay with amber glow, step progress,
 * gradient progress bar, and animated film-strip accent.
 */

import React from 'react';
import { Film, Sparkles, BookOpen, Zap, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import type { ProcessingProgress } from '../types/cinematifier';
import { getOfflineQuote, getProcessingQuote, type Quote } from '../lib/runtime/quotableApi';

interface ProcessingStep {
    id: string;
    label: string;
    icon: React.ReactNode;
}

interface ProcessingOverlayProps {
    progress: ProcessingProgress;
}

type ProcessingUiState = 'uploading' | 'processing' | 'completed' | 'failed';

const STEPS: ProcessingStep[] = [
    { id: 'extract', label: 'Extracting manuscript text', icon: <FileText size={16} /> },
    { id: 'segment', label: 'Segmenting into chapters', icon: <BookOpen size={16} /> },
    { id: 'structure', label: 'Mapping narrative structure', icon: <Zap size={16} /> },
    { id: 'cinematify', label: 'Applying cinematic engine', icon: <Sparkles size={16} /> },
    { id: 'finalize', label: 'Finalizing the experience', icon: <Film size={16} /> },
];

function getStepStatus(stepId: string, currentStage: string): 'done' | 'active' | 'pending' {
    const stageOrder = ['extract', 'segment', 'structure', 'cinematify', 'finalize'];
    const stepIdx = stageOrder.indexOf(stepId);
    const stageIdx = stageOrder.indexOf(currentStage);
    if (stepIdx < stageIdx) return 'done';
    if (stepIdx === stageIdx) return 'active';
    return 'pending';
}

function assertUnreachable(value: never): never {
    throw new Error(`Unhandled processing phase: ${String(value)}`);
}

function getUiState(phase: ProcessingProgress['phase']): ProcessingUiState {
    switch (phase) {
        case 'uploading':
            return 'uploading';
        case 'extracting':
        case 'segmenting':
        case 'structuring':
        case 'cinematifying':
            return 'processing';
        case 'complete':
            return 'completed';
        case 'error':
            return 'failed';
    }
    return assertUnreachable(phase);
}

function getUiStateLabel(state: ProcessingUiState): string {
    switch (state) {
        case 'uploading':
            return 'Uploading';
        case 'processing':
            return 'Processing';
        case 'completed':
            return 'Completed';
        case 'failed':
            return 'Failed';
    }
}

function getUiStateHeadline(state: ProcessingUiState): string {
    switch (state) {
        case 'uploading':
            return 'Uploading your manuscript';
        case 'processing':
            return 'Cinematifying your novel';
        case 'completed':
            return 'Cinematification complete';
        case 'failed':
            return 'Processing failed';
    }
}

function getUiStateSubtitle(state: ProcessingUiState): string {
    switch (state) {
        case 'uploading':
            return 'Preparing your file for processing';
        case 'processing':
            return 'Your manuscript is being transformed into cinema';
        case 'completed':
            return 'Everything is ready for reading';
        case 'failed':
            return 'Please retry with a different file or provider settings';
    }
}

function getInsightText(state: ProcessingUiState): string {
    switch (state) {
        case 'uploading':
            return 'Your file is being validated and prepared for chunked processing.';
        case 'processing':
            return 'Emotional arcs, dialogue cadence, and scene pacing are being calculated for your story...';
        case 'completed':
            return 'Processing finished successfully. You can continue into the reader.';
        case 'failed':
            return 'Processing stopped before completion. Your partial progress has been saved for retry.';
    }
}

export const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({ progress }) => {
    const uiState = getUiState(progress.phase);
    const stage = (() => {
        switch (progress.phase) {
            case 'uploading':
            case 'extracting':
                return 'extract';
            case 'segmenting':
                return 'segment';
            case 'structuring':
                return 'structure';
            case 'cinematifying':
                return 'cinematify';
            case 'complete':
                return 'finalize';
            case 'error':
                // Error is terminal in this flow, so reuse the final step bucket.
                return 'finalize';
        }

        return assertUnreachable(progress.phase);
    })();
    const percent = Math.min(100, Math.max(0, Math.round(progress.percentComplete)));
    const detail = progress.message;
    const stateLabel = getUiStateLabel(uiState);
    const headline = getUiStateHeadline(uiState);
    const subtitle = getUiStateSubtitle(uiState);
    const insightText = getInsightText(uiState);
    const isLoadingState = uiState === 'uploading' || uiState === 'processing';
    const isTestMode = import.meta.env?.MODE === 'test';
    const [quote, setQuote] = React.useState<Quote | null>(() =>
        isTestMode ? getOfflineQuote('processing-overlay') : null,
    );

    React.useEffect(() => {
        if (isTestMode) return;

        let mounted = true;

        void getProcessingQuote().then(nextQuote => {
            if (!mounted) return;
            setQuote(nextQuote);
        });

        return () => {
            mounted = false;
        };
    }, [isTestMode]);

    return (
        <div
            className="proc-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Processing your manuscript"
            aria-live="polite"
        >
            {/* Ambient glows */}
            <div className="proc-glow proc-glow--amber" aria-hidden="true" />
            <div className="proc-glow proc-glow--rose" aria-hidden="true" />

            {/* Main card */}
            <div className="proc-card">
                {/* Film strip accent */}
                <div className="proc-film-strip" aria-hidden="true">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div
                            key={i}
                            className={`proc-film-frame proc-film-frame--${(i % 3) + 1}`}
                        />
                    ))}
                </div>

                {/* Header */}
                <div className="proc-card-header">
                    <div
                        className={`proc-spinner-ring proc-spinner-ring--${uiState}`}
                        aria-hidden="true"
                    >
                        {isLoadingState ? (
                            <Film size={24} color="var(--primary)" strokeWidth={1.5} />
                        ) : uiState === 'completed' ? (
                            <CheckCircle size={24} color="var(--tertiary)" strokeWidth={1.5} />
                        ) : (
                            <AlertCircle size={24} color="var(--error)" strokeWidth={1.5} />
                        )}
                    </div>
                    <div>
                        <h2 className="proc-title">{headline}</h2>
                        <p className="proc-subtitle">{subtitle}</p>
                    </div>
                    <div className={`proc-state-chip proc-state-chip--${uiState}`}>
                        {stateLabel}
                    </div>
                </div>

                {/* Progress bar */}
                <div
                    className="proc-progress-track"
                    role="progressbar"
                    aria-valuenow={percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Processing progress: ${percent}%`}
                >
                    <div
                        className={`proc-progress-fill proc-progress-fill--${uiState}`}
                        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                    />
                </div>
                <div className="proc-progress-labels">
                    <span className="proc-stage-label">
                        {detail || STEPS.find(s => s.id === stage)?.label || 'Processing…'}
                    </span>
                    <span className="proc-percent-label">{Math.round(percent)}%</span>
                </div>

                {/* Steps checklist */}
                <ol className="proc-steps" aria-label="Processing steps">
                    {STEPS.map(step => {
                        const status = getStepStatus(step.id, stage);
                        return (
                            <li key={step.id} className={`proc-step proc-step--${status}`}>
                                <div className="proc-step-icon" aria-hidden="true">
                                    {status === 'done' ? (
                                        <CheckCircle size={16} />
                                    ) : status === 'active' ? (
                                        <div className="proc-step-spinner" />
                                    ) : (
                                        step.icon
                                    )}
                                </div>
                                <span className="proc-step-label">{step.label}</span>
                            </li>
                        );
                    })}
                </ol>

                {/* AI insight teaser */}
                <div className="proc-insight-card">
                    <Sparkles size={14} color="var(--primary)" aria-hidden="true" />
                    <p className="proc-insight-text">{insightText}</p>
                </div>

                {quote && (
                    <div className="proc-insight-card">
                        <Sparkles size={14} color="var(--secondary)" aria-hidden="true" />
                        <p className="proc-insight-text">
                            "{quote.content}" - {quote.author}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProcessingOverlay;
