import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProcessingOverlay } from '../ProcessingOverlay';
import type { ProcessingProgress } from '../../types/cinematifier';

function makeProgress(overrides: Partial<ProcessingProgress>): ProcessingProgress {
    return {
        phase: 'extracting',
        currentChapter: 1,
        totalChapters: 3,
        percentComplete: 35,
        message: 'Extracting text...',
        ...overrides,
    };
}

describe('ProcessingOverlay', () => {
    it('renders uploading state label and progress value', () => {
        render(
            <ProcessingOverlay
                progress={makeProgress({
                    phase: 'uploading',
                    percentComplete: 8,
                    message: 'Uploading file...',
                })}
            />,
        );

        expect(screen.getByText('Uploading')).toBeInTheDocument();
        expect(screen.getByText('Uploading file...')).toBeInTheDocument();
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '8');
    });

    it('maps extraction/segmenting/cinematifying phases to processing state', () => {
        render(
            <ProcessingOverlay
                progress={makeProgress({
                    phase: 'cinematifying',
                    percentComplete: 72,
                    message: 'Processing chunks...',
                })}
            />,
        );

        expect(screen.getByText('Processing')).toBeInTheDocument();
        expect(screen.getByText('Processing chunks...')).toBeInTheDocument();
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '72');
    });

    it('renders completed state label', () => {
        render(
            <ProcessingOverlay
                progress={makeProgress({
                    phase: 'complete',
                    percentComplete: 100,
                    message: 'Ready to read!',
                })}
            />,
        );

        expect(screen.getByText('Completed')).toBeInTheDocument();
        expect(screen.getByText('Ready to read!')).toBeInTheDocument();
    });

    it('renders failed state label and status update', () => {
        render(
            <ProcessingOverlay
                progress={makeProgress({
                    phase: 'error',
                    percentComplete: 100,
                    message: 'Processing failed. Please retry.',
                })}
            />,
        );

        expect(screen.getByText('Failed')).toBeInTheDocument();
        expect(screen.getByText('Processing failed. Please retry.')).toBeInTheDocument();
    });
});
