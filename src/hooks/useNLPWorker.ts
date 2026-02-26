/**
 * useNLPWorker.ts — React Hook for NLP Web Worker
 *
 * Provides a clean interface for using the NLP web worker
 * with automatic cleanup, error handling, and loading states.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { NLPOperation, NLPWorkerRequest, NLPWorkerResponse } from '../workers/nlp.worker';

// ═══════════════════════════════════════════════════════════
// 1. TYPES
// ═══════════════════════════════════════════════════════════

export interface UseNLPWorkerOptions {
    /** Auto-terminate worker after this many ms of inactivity */
    idleTimeout?: number;
    /** Callback when worker encounters an error */
    onError?: (error: string) => void;
}

export interface NLPWorkerState {
    isReady: boolean;
    isProcessing: boolean;
    error: string | null;
    lastProcessingTime: number | null;
}

export interface UseNLPWorkerReturn {
    state: NLPWorkerState;
    /** Execute an NLP operation */
    execute: <T = unknown>(
        operation: NLPOperation,
        text: string,
        options?: NLPWorkerRequest['options'],
    ) => Promise<T>;
    /** Terminate the worker */
    terminate: () => void;
}

// ═══════════════════════════════════════════════════════════
// 2. UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════

let requestIdCounter = 0;

function generateRequestId(): string {
    return `nlp-${Date.now()}-${++requestIdCounter}`;
}

// ═══════════════════════════════════════════════════════════
// 3. HOOK IMPLEMENTATION
// ═══════════════════════════════════════════════════════════

export function useNLPWorker(options: UseNLPWorkerOptions = {}): UseNLPWorkerReturn {
    const { idleTimeout = 60000, onError } = options;

    const workerRef = useRef<Worker | null>(null);
    const pendingRequestsRef = useRef<
        Map<
            string,
            {
                resolve: (value: unknown) => void;
                reject: (error: Error) => void;
            }
        >
    >(new Map());
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [state, setState] = useState<NLPWorkerState>({
        isReady: false,
        isProcessing: false,
        error: null,
        lastProcessingTime: null,
    });

    // Initialize worker lazily
    const getWorker = useCallback((): Worker => {
        if (!workerRef.current) {
            workerRef.current = new Worker(new URL('../workers/nlp.worker.ts', import.meta.url), {
                type: 'module',
            });

            workerRef.current.onmessage = (
                event: MessageEvent<NLPWorkerResponse | { type: string }>,
            ) => {
                const data = event.data;

                // Handle ready signal
                if ('type' in data && data.type === 'ready') {
                    setState(s => ({ ...s, isReady: true, error: null }));
                    return;
                }

                // Handle response
                const response = data as NLPWorkerResponse;
                const pending = pendingRequestsRef.current.get(response.id);

                if (pending) {
                    pendingRequestsRef.current.delete(response.id);

                    // Update state
                    setState(s => ({
                        ...s,
                        isProcessing: pendingRequestsRef.current.size > 0,
                        lastProcessingTime: response.processingTime,
                        error: response.success ? null : response.error || null,
                    }));

                    if (response.success) {
                        pending.resolve(response.result);
                    } else {
                        const errorMsg = response.error || 'Unknown worker error';
                        onError?.(errorMsg);
                        pending.reject(new Error(errorMsg));
                    }
                }
            };

            workerRef.current.onerror = error => {
                const errorMsg = error.message || 'Worker error';
                setState(s => ({ ...s, error: errorMsg, isProcessing: false }));
                onError?.(errorMsg);

                // Reject all pending requests
                pendingRequestsRef.current.forEach(({ reject }) => {
                    reject(new Error(errorMsg));
                });
                pendingRequestsRef.current.clear();
            };
        }

        // Reset idle timer
        if (idleTimerRef.current) {
            clearTimeout(idleTimerRef.current);
        }
        idleTimerRef.current = setTimeout(() => {
            if (workerRef.current && pendingRequestsRef.current.size === 0) {
                workerRef.current.terminate();
                workerRef.current = null;
                setState(s => ({ ...s, isReady: false }));
            }
        }, idleTimeout);

        return workerRef.current;
    }, [idleTimeout, onError]);

    // Execute operation
    const execute = useCallback(
        <T = unknown>(
            operation: NLPOperation,
            text: string,
            options?: NLPWorkerRequest['options'],
        ): Promise<T> => {
            return new Promise((resolve, reject) => {
                const worker = getWorker();
                const id = generateRequestId();

                pendingRequestsRef.current.set(id, {
                    resolve: resolve as (value: unknown) => void,
                    reject,
                });

                setState(s => ({ ...s, isProcessing: true, error: null }));

                const request: NLPWorkerRequest = {
                    id,
                    operation,
                    text,
                    options,
                };

                worker.postMessage(request);
            });
        },
        [getWorker],
    );

    // Terminate worker
    const terminate = useCallback(() => {
        if (idleTimerRef.current) {
            clearTimeout(idleTimerRef.current);
            idleTimerRef.current = null;
        }

        if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
        }

        // Reject pending requests
        pendingRequestsRef.current.forEach(({ reject }) => {
            reject(new Error('Worker terminated'));
        });
        pendingRequestsRef.current.clear();

        setState({
            isReady: false,
            isProcessing: false,
            error: null,
            lastProcessingTime: null,
        });
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            terminate();
        };
    }, [terminate]);

    return {
        state,
        execute,
        terminate,
    };
}

export default useNLPWorker;
