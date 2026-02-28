import { render, screen, waitFor } from '@testing-library/react';
import React, { Suspense } from 'react';

// ─── ERROR BOUNDARY ────────────────────────────────────────────────

describe('ErrorBoundary', () => {
    // Simple component that throws for testing
    const ThrowingComponent = () => {
        throw new Error('Test error');
    };

    it('catches errors from child components', async () => {
        // Import the real ErrorBoundary
        const { ErrorBoundary } = await import('../../components/ui/ErrorBoundary');

        // Suppress React error boundary console output
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

        render(
            <ErrorBoundary fallback={<div data-testid="error-fallback">Error caught</div>}>
                <ThrowingComponent />
            </ErrorBoundary>,
        );

        expect(screen.getByTestId('error-fallback')).toBeInTheDocument();

        spy.mockRestore();
    });
});

// ─── SUSPENSE FALLBACK ─────────────────────────────────────────────

describe('Suspense fallback', () => {
    it('shows fallback while lazy component loads', async () => {
        // Create a component that suspends
        let resolve: (mod: { default: React.FC }) => void;
        const LazyTest = React.lazy(
            () =>
                new Promise<{ default: React.FC }>(r => {
                    resolve = r;
                }),
        );

        render(
            <Suspense fallback={<div data-testid="loading">Loading...</div>}>
                <LazyTest />
            </Suspense>,
        );

        expect(screen.getByTestId('loading')).toBeInTheDocument();

        // Resolve the lazy load
        resolve!({ default: () => <div data-testid="loaded">Loaded</div> });

        await waitFor(() => {
            expect(screen.getByTestId('loaded')).toBeInTheDocument();
        });
    });
});
