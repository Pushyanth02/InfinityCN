/**
 * ProcessingOverlay.tsx — Cinematic book processing screen
 *
 * Velvet Noir design system — "upload_processing_dark" reference.
 * Full-screen glass overlay with amber glow, step progress,
 * gradient progress bar, and animated film-strip accent.
 */

import React from 'react';
import { Film, Sparkles, BookOpen, Zap, FileText, CheckCircle } from 'lucide-react';
import type { ProcessingProgress } from '../types/cinematifier';

interface ProcessingStep {
    id: string;
    label: string;
    icon: React.ReactNode;
}

interface ProcessingOverlayProps {
    progress: ProcessingProgress;
}

const STEPS: ProcessingStep[] = [
    { id: 'extract',    label: 'Extracting manuscript text',      icon: <FileText size={16} /> },
    { id: 'segment',   label: 'Segmenting into chapters',         icon: <BookOpen size={16} /> },
    { id: 'structure', label: 'Mapping narrative structure',       icon: <Zap size={16} /> },
    { id: 'cinematify',label: 'Applying cinematic engine',        icon: <Sparkles size={16} /> },
    { id: 'finalize',  label: 'Finalizing the experience',        icon: <Film size={16} /> },
];

function getStepStatus(stepId: string, currentStage: string): 'done' | 'active' | 'pending' {
    const stageOrder = ['extract', 'segment', 'structure', 'cinematify', 'finalize'];
    const stepIdx  = stageOrder.indexOf(stepId);
    const stageIdx = stageOrder.indexOf(currentStage);
    if (stepIdx < stageIdx)  return 'done';
    if (stepIdx === stageIdx) return 'active';
    return 'pending';
}

function assertUnreachable(value: never): never {
    throw new Error(`Unhandled processing phase: ${String(value)}`);
}

export const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({ progress }) => {
    const stage = (() => {
        switch (progress.phase) {
            case 'extracting':
                return 'extract';
            case 'segmenting':
                return 'segment';
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
    const percent = progress.percentComplete;
    const detail = progress.message;

    return (
        <div className="proc-backdrop" role="dialog" aria-modal="true" aria-label="Processing your manuscript" aria-live="polite">
            {/* Ambient glows */}
            <div className="proc-glow proc-glow--amber" aria-hidden="true" />
            <div className="proc-glow proc-glow--rose"  aria-hidden="true" />

            {/* Main card */}
            <div className="proc-card">
                {/* Film strip accent */}
                <div className="proc-film-strip" aria-hidden="true">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className={`proc-film-frame proc-film-frame--${(i % 3) + 1}`} />
                    ))}
                </div>

                {/* Header */}
                <div className="proc-card-header">
                    <div className="proc-spinner-ring" aria-hidden="true">
                        <Film size={24} color="var(--primary)" strokeWidth={1.5} />
                    </div>
                    <div>
                        <h2 className="proc-title">Cinematifying your novel</h2>
                        <p className="proc-subtitle">Your manuscript is being transformed into cinema</p>
                    </div>
                </div>

                {/* Progress bar */}
                <div className="proc-progress-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`Processing progress: ${percent}%`}>
                    <div
                        className="proc-progress-fill"
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
                                    {status === 'done'
                                        ? <CheckCircle size={16} />
                                        : status === 'active'
                                        ? <div className="proc-step-spinner" />
                                        : step.icon
                                    }
                                </div>
                                <span className="proc-step-label">{step.label}</span>
                            </li>
                        );
                    })}
                </ol>

                {/* AI insight teaser */}
                <div className="proc-insight-card">
                    <Sparkles size={14} color="var(--primary)" aria-hidden="true" />
                    <p className="proc-insight-text">
                        Emotional arcs, dialogue cadence, and scene pacing are being calculated for your story…
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ProcessingOverlay;
