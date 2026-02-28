import { Component } from 'react';
import type { ReactNode } from 'react';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    render() {
        if (this.state.hasError) {
            return (
                this.props.fallback ?? (
                    <div
                        role="alert"
                        style={{
                            padding: '1rem 1.5rem',
                            margin: '1rem',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '8px',
                            color: '#f87171',
                            fontSize: '0.875rem',
                        }}
                    >
                        Something went wrong loading this component.
                        <button
                            onClick={() => this.setState({ hasError: false, error: null })}
                            style={{
                                marginLeft: '0.5rem',
                                textDecoration: 'underline',
                                background: 'none',
                                border: 'none',
                                color: 'inherit',
                                cursor: 'pointer',
                            }}
                        >
                            Try again
                        </button>
                    </div>
                )
            );
        }
        return this.props.children;
    }
}
