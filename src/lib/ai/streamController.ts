/**
 * ai/streamController.ts — Streaming AI Response Layer
 *
 * High-level streaming orchestration for real-time cinematic rendering.
 *
 * Architecture:
 *   StreamSession → StreamController → Provider stream → Event Bus → UI
 *
 * Features:
 *   - AsyncIterable token streaming via streamResponse()
 *   - Abort/cancel support with AbortController
 *   - Provider fallback during streaming (pre-emit only)
 *   - Progress events (token count, chunk count, latency, provider info)
 *   - Chunk buffering for smooth UI rendering
 *   - Typed event bus (token, chunk, progress, complete, error, retry)
 *
 * No UI code. Consumer binds to events for rendering.
 */

import type { AIConfig, AIProviderName } from './types';
import { getProvider, hasProvider } from './providers/index';
import { MODEL_PRESETS } from './presets';
import { getRateLimiter } from './streaming';
import { prepareAICall } from './providers';
import { classifyError } from './errors';
import { AI_MAX_RETRY_DELAY_MS } from '../constants';

// ─── STREAM EVENT TYPES ───────────────────────────────────────────────────────

export type StreamEventType = 'token' | 'chunk' | 'progress' | 'complete' | 'error' | 'retry';

export interface StreamEvent {
    /** Event kind. */
    type: StreamEventType;
    /** Token or chunk content. */
    content?: string;
    /** Chunk index (increments per buffered flush). */
    chunkIndex?: number;
    /** Current token count so far. */
    tokenCount?: number;
    /** Provider that produced this event. */
    provider?: AIProviderName;
    /** Error details (only for 'error' events). */
    error?: string;
    /** Retry attempt number (only for 'retry' events). */
    retryAttempt?: number;
    /** Time elapsed since stream start (ms). */
    elapsedMs?: number;
    /** Time to first token (ms). Only set on the first token event. */
    ttftMs?: number;
}

export interface StreamProgress {
    /** Total tokens received so far. */
    tokenCount: number;
    /** Number of flushed chunks. */
    chunkCount: number;
    /** Full text accumulated so far. */
    accumulated: string;
    /** Milliseconds since stream creation. */
    elapsedMs: number;
    /** Time to first token in ms (0 if no token yet). */
    ttftMs: number;
    /** Which provider is actively streaming. */
    activeProvider: AIProviderName;
    /** All providers attempted (including fallback attempts). */
    attemptedProviders: AIProviderName[];
    /** Current session state. */
    state: StreamSessionState;
    /** Estimated tokens per second throughput. */
    tokensPerSecond: number;
}

// ─── STREAM SESSION ───────────────────────────────────────────────────────────

export type StreamSessionState =
    | 'idle'
    | 'connecting'
    | 'streaming'
    | 'buffering'
    | 'retrying'
    | 'complete'
    | 'cancelled'
    | 'error';

export type StreamEventHandler = (event: StreamEvent) => void;

/**
 * Represents a single streaming request lifecycle.
 *
 * Tracks all state for one stream: accumulated text, token counts,
 * timing, provider history, and abort state.
 */
export class StreamSession {
    /** Unique session ID. */
    readonly id: string;
    /** When the session was created. */
    readonly createdAt: number;

    private _state: StreamSessionState = 'idle';
    private _accumulated = '';
    private _tokenCount = 0;
    private _chunkCount = 0;
    private _ttftMs = 0;
    private _activeProvider: AIProviderName = 'none';
    private readonly _attemptedProviders: AIProviderName[] = [];
    private readonly _abortController: AbortController;
    private readonly _listeners = new Map<StreamEventType | '*', StreamEventHandler[]>();

    constructor(abortController?: AbortController) {
        this.id = this.generateId();
        this.createdAt = Date.now();
        this._abortController = abortController ?? new AbortController();
    }

    // ─── Public Getters ──────────────────────────────────────────────────

    get state(): StreamSessionState {
        return this._state;
    }
    get accumulated(): string {
        return this._accumulated;
    }
    get tokenCount(): number {
        return this._tokenCount;
    }
    get chunkCount(): number {
        return this._chunkCount;
    }
    get ttftMs(): number {
        return this._ttftMs;
    }
    get activeProvider(): AIProviderName {
        return this._activeProvider;
    }
    get attemptedProviders(): readonly AIProviderName[] {
        return this._attemptedProviders;
    }
    get elapsedMs(): number {
        return Date.now() - this.createdAt;
    }
    get signal(): AbortSignal {
        return this._abortController.signal;
    }
    get isAborted(): boolean {
        return this._abortController.signal.aborted;
    }
    get isActive(): boolean {
        return (
            this._state === 'streaming' ||
            this._state === 'buffering' ||
            this._state === 'connecting' ||
            this._state === 'retrying'
        );
    }

    get tokensPerSecond(): number {
        const elapsed = this.elapsedMs / 1000;
        return elapsed > 0 ? this._tokenCount / elapsed : 0;
    }

    // ─── State Management ────────────────────────────────────────────────

    /** @internal Update session state. */
    _setState(state: StreamSessionState): void {
        this._state = state;
    }

    /** @internal Set the active provider. */
    _setActiveProvider(provider: AIProviderName): void {
        this._activeProvider = provider;
        if (!this._attemptedProviders.includes(provider)) {
            this._attemptedProviders.push(provider);
        }
    }

    /** @internal Append a token to accumulated text. */
    _appendToken(token: string): void {
        this._accumulated += token;
        this._tokenCount++;
        if (this._ttftMs === 0) {
            this._ttftMs = this.elapsedMs;
        }
    }

    /** @internal Increment chunk count after a buffer flush. */
    _flushChunk(): number {
        return this._chunkCount++;
    }

    /** Cancel the stream. */
    cancel(): void {
        if (this.isActive) {
            this._state = 'cancelled';
            this._abortController.abort(new Error('Stream cancelled by user.'));
        }
    }

    // ─── Event Bus ───────────────────────────────────────────────────────

    /** Subscribe to stream events. Use '*' to receive all events. */
    on(type: StreamEventType | '*', handler: StreamEventHandler): () => void {
        if (!this._listeners.has(type)) {
            this._listeners.set(type, []);
        }
        this._listeners.get(type)!.push(handler);
        return () => this.off(type, handler);
    }

    /** Unsubscribe from stream events. */
    off(type: StreamEventType | '*', handler: StreamEventHandler): void {
        const handlers = this._listeners.get(type);
        if (!handlers) return;
        const idx = handlers.indexOf(handler);
        if (idx !== -1) handlers.splice(idx, 1);
    }

    /** @internal Emit an event to all registered listeners. */
    _emit(event: StreamEvent): void {
        const specific = this._listeners.get(event.type);
        if (specific) {
            for (const handler of specific) {
                try {
                    handler(event);
                } catch {
                    /* listener errors are swallowed */
                }
            }
        }
        const wildcard = this._listeners.get('*');
        if (wildcard) {
            for (const handler of wildcard) {
                try {
                    handler(event);
                } catch {
                    /* listener errors are swallowed */
                }
            }
        }
    }

    /** Get a snapshot of current progress. */
    getProgress(): StreamProgress {
        return {
            tokenCount: this._tokenCount,
            chunkCount: this._chunkCount,
            accumulated: this._accumulated,
            elapsedMs: this.elapsedMs,
            ttftMs: this._ttftMs,
            activeProvider: this._activeProvider,
            attemptedProviders: [...this._attemptedProviders],
            state: this._state,
            tokensPerSecond: this.tokensPerSecond,
        };
    }

    /** Remove all listeners. */
    removeAllListeners(): void {
        this._listeners.clear();
    }

    private generateId(): string {
        // Compact monotonic ID: timestamp base36 + random suffix
        return `ss_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }
}

// ─── STREAM CONTROLLER OPTIONS ────────────────────────────────────────────────

export interface StreamControllerOptions {
    /** Maximum providers to try before giving up. Default: 3. */
    maxFallbackAttempts?: number;
    /** Per-provider retry count before failing over. Default: 1. */
    maxRetriesPerProvider?: number;
    /** Base delay for retry backoff in ms. Default: 1000. */
    retryBaseDelayMs?: number;
    /**
     * Buffer size in tokens before flushing a chunk.
     * Lower = more responsive UI. Higher = fewer re-renders.
     * Default: 1 (immediate — every token fires a chunk).
     */
    chunkBufferSize?: number;
    /**
     * Maximum time (ms) to hold a buffer before auto-flushing.
     * Ensures rendering even during slow token arrival.
     * Default: 100.
     */
    chunkFlushIntervalMs?: number;
    /** Fallback provider order. If omitted, uses all available streaming providers. */
    fallbackProviders?: AIProviderName[];
    /** Progress event interval in ms. Default: 500. */
    progressIntervalMs?: number;
}

// ─── STREAM CONTROLLER ───────────────────────────────────────────────────────

/**
 * Orchestrates streaming AI responses with fallback, buffering, and events.
 *
 * Usage:
 * ```ts
 * const controller = new StreamController();
 * const session = controller.createSession();
 *
 * // Subscribe to events
 * session.on('token', (e) => appendToUI(e.content));
 * session.on('chunk', (e) => flushRender(e.content));
 * session.on('complete', () => finalizeUI());
 * session.on('error', (e) => showError(e.error));
 *
 * // Start streaming (also yields tokens for for-await consumers)
 * for await (const token of controller.streamResponse(prompt, config, session)) {
 *     // Optional: handle tokens directly
 * }
 *
 * // Cancel at any time
 * session.cancel();
 * ```
 */
export class StreamController {
    private readonly options: Required<StreamControllerOptions>;

    constructor(options?: StreamControllerOptions) {
        this.options = {
            maxFallbackAttempts: options?.maxFallbackAttempts ?? 3,
            maxRetriesPerProvider: options?.maxRetriesPerProvider ?? 1,
            retryBaseDelayMs: options?.retryBaseDelayMs ?? 1000,
            chunkBufferSize: options?.chunkBufferSize ?? 1,
            chunkFlushIntervalMs: options?.chunkFlushIntervalMs ?? 100,
            fallbackProviders: options?.fallbackProviders ?? [],
            progressIntervalMs: options?.progressIntervalMs ?? 500,
        };
    }

    /** Create a new streaming session. */
    createSession(abortController?: AbortController): StreamSession {
        return new StreamSession(abortController);
    }

    /**
     * Stream a response from an AI provider. Yields individual tokens.
     *
     * Pipeline:
     * 1. Resolve provider order (primary + fallbacks)
     * 2. For each provider: acquire rate limit → open stream → yield tokens
     * 3. On failure (before any tokens emitted): retry → fallback to next provider
     * 4. On failure (after tokens emitted): error — no fallback (partial output)
     * 5. Buffer tokens into chunks → emit 'chunk' events for batched rendering
     * 6. Emit progress events at intervals
     * 7. On success: emit 'complete' event
     * 8. On cancel: stop iteration, emit no further events
     */
    async *streamResponse(
        prompt: string,
        config: AIConfig,
        session: StreamSession,
    ): AsyncGenerator<string> {
        session._setState('connecting');

        const providerOrder = this.resolveProviderOrder(config);
        if (providerOrder.length === 0) {
            session._setState('error');
            session._emit({ type: 'error', error: 'No streaming-capable providers available.' });
            return;
        }

        const maxAttempts = Math.min(this.options.maxFallbackAttempts, providerOrder.length);
        const errors: string[] = [];

        for (let providerIdx = 0; providerIdx < maxAttempts; providerIdx++) {
            if (session.isAborted) {
                session._setState('cancelled');
                return;
            }

            const providerName = providerOrder[providerIdx];
            session._setActiveProvider(providerName);

            // Retry loop per provider
            for (
                let retryAttempt = 0;
                retryAttempt <= this.options.maxRetriesPerProvider;
                retryAttempt++
            ) {
                if (session.isAborted) {
                    session._setState('cancelled');
                    return;
                }

                if (retryAttempt > 0) {
                    session._setState('retrying');
                    session._emit({
                        type: 'retry',
                        provider: providerName,
                        retryAttempt,
                        elapsedMs: session.elapsedMs,
                    });

                    const delay = Math.min(
                        this.options.retryBaseDelayMs * Math.pow(2, retryAttempt - 1),
                        AI_MAX_RETRY_DELAY_MS,
                    );
                    await sleep(delay);
                }

                try {
                    yield* this.executeProviderStream(prompt, config, providerName, session);

                    // If cancelled during streaming, don't mark as complete
                    if (session.isAborted || session.state === 'cancelled') {
                        return;
                    }

                    // Success — complete
                    session._setState('complete');
                    session._emit({
                        type: 'complete',
                        content: session.accumulated,
                        tokenCount: session.tokenCount,
                        chunkIndex: session.chunkCount,
                        provider: providerName,
                        elapsedMs: session.elapsedMs,
                        ttftMs: session.ttftMs,
                    });
                    return;
                } catch (err) {
                    const classified = classifyError(err, providerName);
                    const msg = classified.message;

                    // If tokens were already emitted, we can't fallback cleanly
                    if (session.tokenCount > 0) {
                        session._setState('error');
                        session._emit({
                            type: 'error',
                            error: `Stream interrupted after ${session.tokenCount} tokens on ${providerName}: ${msg}`,
                            provider: providerName,
                            elapsedMs: session.elapsedMs,
                        });
                        throw new Error(
                            `Streaming failed after partial output on ${providerName}: ${msg}`,
                            { cause: err },
                        );
                    }

                    // No tokens emitted — can retry or fallback
                    if (
                        !classified.retryable ||
                        retryAttempt >= this.options.maxRetriesPerProvider
                    ) {
                        errors.push(`${providerName}: ${msg}`);
                        break; // Move to next provider
                    }
                    // Retryable — loop continues
                }
            }
        }

        // All providers exhausted
        session._setState('error');
        const errorMsg = `All providers failed: ${errors.join(' | ')}`;
        session._emit({ type: 'error', error: errorMsg, elapsedMs: session.elapsedMs });
        throw new Error(errorMsg);
    }

    // ─── Provider Stream Execution ────────────────────────────────────────

    private async *executeProviderStream(
        prompt: string,
        config: AIConfig,
        providerName: AIProviderName,
        session: StreamSession,
    ): AsyncGenerator<string> {
        // Prepare the call
        const providerConfig: AIConfig = { ...config, provider: providerName };
        const prepared = prepareAICall(prompt, providerConfig);

        // Rate limit
        const limiter = getRateLimiter(providerName);
        await limiter.acquire({ requests: 1, tokens: prepared.tokenPlan.totalBudgetTokens });

        // Get provider instance
        const providerInstance = getProvider(providerName);

        session._setState('streaming');

        // Token buffer for batched chunk emission
        let buffer = '';
        let bufferTokens = 0;
        let flushTimer: ReturnType<typeof setTimeout> | null = null;
        let progressTimer: ReturnType<typeof setInterval> | null = null;

        const flushBuffer = (): string | null => {
            if (buffer.length === 0) return null;
            const chunk = buffer;
            const chunkIdx = session._flushChunk();
            buffer = '';
            bufferTokens = 0;
            session._emit({
                type: 'chunk',
                content: chunk,
                chunkIndex: chunkIdx,
                tokenCount: session.tokenCount,
                provider: providerName,
                elapsedMs: session.elapsedMs,
            });
            return chunk;
        };

        const startFlushTimer = (): void => {
            if (flushTimer !== null) return;
            if (this.options.chunkFlushIntervalMs <= 0) return;
            flushTimer = setTimeout(() => {
                flushTimer = null;
                flushBuffer();
            }, this.options.chunkFlushIntervalMs);
        };

        const stopTimers = (): void => {
            if (flushTimer !== null) {
                clearTimeout(flushTimer);
                flushTimer = null;
            }
            if (progressTimer !== null) {
                clearInterval(progressTimer);
                progressTimer = null;
            }
        };

        // Start progress reporting
        if (this.options.progressIntervalMs > 0) {
            progressTimer = setInterval(() => {
                if (!session.isActive) {
                    stopTimers();
                    return;
                }
                session._emit({
                    type: 'progress',
                    tokenCount: session.tokenCount,
                    chunkIndex: session.chunkCount,
                    provider: providerName,
                    elapsedMs: session.elapsedMs,
                });
            }, this.options.progressIntervalMs);
        }

        try {
            const stream = providerInstance.stream(prompt, providerConfig, {
                model: prepared.model,
                maxTokens: prepared.maxTokens,
                temperature: prepared.preset.temperature,
                systemPrompt: prepared.systemPrompt,
                useJSON: prepared.useJSON,
                rawTextMode: config.rawTextMode,
                timeoutMs: prepared.timeoutMs,
                signal: session.signal,
            });

            for await (const token of stream) {
                if (session.isAborted) {
                    stopTimers();
                    session._setState('cancelled');
                    return;
                }

                // Record token
                const isFirst = session.tokenCount === 0;
                session._appendToken(token);

                // Emit token event
                session._emit({
                    type: 'token',
                    content: token,
                    tokenCount: session.tokenCount,
                    provider: providerName,
                    elapsedMs: session.elapsedMs,
                    ttftMs: isFirst ? session.ttftMs : undefined,
                });

                // Buffer for chunked rendering
                buffer += token;
                bufferTokens++;

                if (bufferTokens >= this.options.chunkBufferSize) {
                    flushBuffer();
                    if (flushTimer !== null) {
                        clearTimeout(flushTimer);
                        flushTimer = null;
                    }
                } else {
                    startFlushTimer();
                }

                // Yield to consumer
                yield token;
            }

            // Flush any remaining buffer
            flushBuffer();
        } finally {
            stopTimers();
        }
    }

    // ─── Provider Resolution ──────────────────────────────────────────────

    private resolveProviderOrder(config: AIConfig): AIProviderName[] {
        const primary = config.provider;
        const order: AIProviderName[] = [];

        // Primary provider first (if it supports streaming)
        if (primary !== 'none' && hasProvider(primary)) {
            const preset = MODEL_PRESETS[primary];
            if (preset?.supportsStreaming) {
                order.push(primary);
            }
        }

        // Explicit fallbacks from options
        if (this.options.fallbackProviders.length > 0) {
            for (const name of this.options.fallbackProviders) {
                if (order.includes(name)) continue;
                if (!hasProvider(name)) continue;
                const preset = MODEL_PRESETS[name];
                if (preset?.supportsStreaming) {
                    order.push(name);
                }
            }
            return order;
        }

        // Auto-detect fallbacks from presets
        const allProviders: AIProviderName[] = [
            'gemini',
            'openai',
            'groq',
            'deepseek',
            'anthropic',
            'ollama',
            'nvidia-nim',
            'gemma',
            'gwen',
            'chrome',
        ];
        for (const name of allProviders) {
            if (order.includes(name)) continue;
            if (!hasProvider(name)) continue;
            const preset = MODEL_PRESETS[name];
            if (preset?.supportsStreaming) {
                order.push(name);
            }
        }

        return order;
    }
}

// ─── CONVENIENCE FUNCTIONS ────────────────────────────────────────────────────

let defaultController: StreamController | null = null;

/** Get the default singleton controller. */
export function getDefaultStreamController(): StreamController {
    if (!defaultController) {
        defaultController = new StreamController();
    }
    return defaultController;
}

/**
 * Convenience: create a session and start streaming in one call.
 *
 * Returns the session (for event binding) and an async iterable of tokens.
 *
 * Usage:
 * ```ts
 * const { session, tokens } = streamResponse(prompt, config);
 *
 * session.on('token', (e) => renderToken(e.content));
 * session.on('chunk', (e) => flushChunk(e.content, e.chunkIndex));
 * session.on('progress', (e) => updateProgress(e.tokenCount));
 * session.on('complete', (e) => finalizeRender());
 * session.on('error', (e) => showError(e.error));
 *
 * for await (const token of tokens) {
 *     // Direct consumption — events fire in parallel
 * }
 *
 * // Or cancel at any time:
 * session.cancel();
 * ```
 */
export function streamResponse(
    prompt: string,
    config: AIConfig,
    options?: StreamControllerOptions,
): { session: StreamSession; tokens: AsyncGenerator<string> } {
    const controller = options ? new StreamController(options) : getDefaultStreamController();
    const session = controller.createSession();
    const tokens = controller.streamResponse(prompt, config, session);
    return { session, tokens };
}

/**
 * Cancel an active stream session.
 */
export function cancelStream(session: StreamSession): void {
    session.cancel();
}

/**
 * Register a token handler on a session. Returns unsubscribe function.
 */
export function onToken(session: StreamSession, handler: (token: string) => void): () => void {
    return session.on('token', e => {
        if (e.content !== undefined) handler(e.content);
    });
}

/**
 * Register a chunk-complete handler on a session. Returns unsubscribe function.
 */
export function onChunkComplete(
    session: StreamSession,
    handler: (chunk: string, chunkIndex: number) => void,
): () => void {
    return session.on('chunk', e => {
        if (e.content !== undefined && e.chunkIndex !== undefined) {
            handler(e.content, e.chunkIndex);
        }
    });
}

// ─── INTERNAL HELPERS ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
