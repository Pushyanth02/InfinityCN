import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React, { Suspense } from 'react';

// Mock Dexie for cinematifierDb - needs to be a proper class
vi.mock('dexie', () => {
    class MockDexie {
        constructor() {
            // Empty constructor
        }
        version() {
            return {
                stores: () => ({
                    upgrade: () => ({}),
                }),
            };
        }
    }
    return { default: MockDexie };
});

// Mock cinematifierDb module to avoid Dexie instantiation issues
vi.mock('../../lib/cinematifierDb', () => ({
    saveBook: vi.fn().mockResolvedValue(undefined),
    loadLatestBook: vi.fn().mockResolvedValue(null),
    loadBook: vi.fn().mockResolvedValue(null),
    updateBookChapter: vi.fn().mockResolvedValue(undefined),
    deleteBook: vi.fn().mockResolvedValue(undefined),
    listBooks: vi.fn().mockResolvedValue([]),
    saveReadingProgress: vi.fn().mockResolvedValue(undefined),
    loadReadingProgress: vi.fn().mockResolvedValue(null),
}));

// ─── LAZY-LOADED COMPONENT SMOKE TESTS ─────────────────────────────

describe('Lazy component loading', () => {
    it('CinematicReader lazy component module can be imported', async () => {
        // Verify the module resolves (does not throw at import time)
        const module = await import('../../components/CinematicReader');
        expect(module).toBeDefined();
    });

    it('CinematifierSettings lazy component module can be imported', async () => {
        const module = await import('../../components/CinematifierSettings');
        expect(module).toBeDefined();
    });
});

// ─── ERROR BOUNDARY ────────────────────────────────────────────────

describe('ErrorBoundary', () => {
    // Simple component that throws for testing
    const ThrowingComponent = () => {
        throw new Error('Test error');
    };

    it('catches errors from child components', async () => {
        // Test the error boundary pattern
        class TestErrorBoundary extends React.Component<
            { children: React.ReactNode },
            { hasError: boolean; error: Error | null }
        > {
            state = { hasError: false, error: null as Error | null };
            static getDerivedStateFromError(error: Error) {
                return { hasError: true, error };
            }
            render() {
                if (this.state.hasError) {
                    return (
                        <div data-testid="error-fallback">Error: {this.state.error?.message}</div>
                    );
                }
                return this.props.children;
            }
        }

        // Suppress React error boundary console output
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

        render(
            <TestErrorBoundary>
                <ThrowingComponent />
            </TestErrorBoundary>,
        );

        expect(screen.getByTestId('error-fallback')).toBeInTheDocument();
        expect(screen.getByText(/Test error/)).toBeInTheDocument();

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
