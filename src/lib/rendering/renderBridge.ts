/**
 * rendering/renderBridge.ts — Real-Time Rendering Integration Layer
 *
 * Bridges the AI streaming subsystem to the reader UI without coupling
 * either side to the other. Converts stream events into progressive
 * scene render states that the React layer can consume.
 *
 * Architecture:
 *   StreamSession (AI) → RenderBridge → ReaderUpdateBus → React hooks → UI
 *
 * Design constraints:
 *   - Renderer has ZERO knowledge of AI providers, configs, or retry logic
 *   - AI layer has ZERO knowledge of React, DOM, or rendering
 *   - All communication is through typed events
 *   - Supports Original and Cinematized rendering modes
 *   - Handles partial scene rendering as chunks arrive
 *
 * No UI code. No AI provider imports.
 */

import type { CinematicBlock } from '../../types/cinematifier';

// ─── READER MODE ──────────────────────────────────────────────────────────────

export type ReaderRenderMode = 'original' | 'cinematized';

// ─── SCENE RENDER STATE ───────────────────────────────────────────────────────

/**
 * Tracks the rendering state of a single scene across the streaming lifecycle.
 *
 * A scene transitions through states:
 *   pending → streaming → partial → complete
 *   pending → streaming → error
 *   pending → skipped (for deduplication)
 */
export type SceneRenderStatus =
    | 'pending' // Awaiting first token
    | 'streaming' // Actively receiving tokens
    | 'partial' // Has some content, stream paused/buffering
    | 'complete' // All content received
    | 'error' // Stream failed for this scene
    | 'skipped'; // Deduplicated — cached or already processed

export interface SceneRenderState {
    /** Unique scene identifier. */
    readonly sceneId: string;
    /** Current render status. */
    status: SceneRenderStatus;
    /** Accumulated text content so far (raw, pre-block-parse). */
    accumulatedText: string;
    /** Accumulated cinematic blocks if using semantic parsing. */
    accumulatedBlocks?: CinematicBlock[];
    /** Number of tokens received for this scene. */
    tokenCount: number;
    /** Number of flushed chunks for this scene. */
    chunkCount: number;
    /** Progress ratio 0..1 (estimated from token count vs expected). */
    progress: number;
    /** Estimated total tokens (from previous runs or heuristic). */
    estimatedTotalTokens: number;
    /** When streaming started for this scene (epoch ms). */
    startedAt: number;
    /** When streaming completed (epoch ms, 0 if not yet). */
    completedAt: number;
    /** Error message if status === 'error'. */
    errorMessage?: string;
    /** Provider that is/was streaming this scene. */
    provider?: string;
}

/**
 * Create a fresh SceneRenderState.
 */
export function createSceneRenderState(
    sceneId: string,
    estimatedTotalTokens?: number,
): SceneRenderState {
    return {
        sceneId,
        status: 'pending',
        accumulatedText: '',
        tokenCount: 0,
        chunkCount: 0,
        progress: 0,
        estimatedTotalTokens: estimatedTotalTokens ?? 0,
        startedAt: 0,
        completedAt: 0,
    };
}

// ─── READER STATE ─────────────────────────────────────────────────────────────

/**
 * Aggregate reader state exposed to the UI.
 * This is the single source of truth for the rendering layer.
 */
export interface ReaderState {
    /** Current rendering mode. */
    mode: ReaderRenderMode;
    /** Currently active scene (receiving tokens or last completed). */
    currentSceneId: string | null;
    /** Overall progress ratio 0..1 across all scenes. */
    progress: number;
    /** Whether any scene is actively streaming. */
    streaming: boolean;
    /** Current error, if any. */
    error?: string;
    /** Total tokens received across all scenes. */
    totalTokens: number;
    /** Time to first token (ms) for the current batch. */
    ttftMs: number;
    /** Tokens-per-second throughput. */
    tokensPerSecond: number;
    /** Provider currently active. */
    activeProvider?: string;
    /** Per-scene render states, keyed by scene ID. */
    scenes: ReadonlyMap<string, SceneRenderState>;
    /** Number of completed scenes. */
    completedScenes: number;
    /** Total number of tracked scenes. */
    totalScenes: number;
}

/**
 * Create a fresh ReaderState.
 */
export function createReaderState(mode: ReaderRenderMode = 'cinematized'): ReaderState {
    return {
        mode,
        currentSceneId: null,
        progress: 0,
        streaming: false,
        totalTokens: 0,
        ttftMs: 0,
        tokensPerSecond: 0,
        scenes: new Map(),
        completedScenes: 0,
        totalScenes: 0,
    };
}

// ─── READER UPDATE BUS ────────────────────────────────────────────────────────

/**
 * Events emitted by the render bridge to the UI layer.
 */
export type ReaderUpdateType =
    | 'scene:start' // Scene begins streaming
    | 'scene:token' // Individual token arrived
    | 'scene:chunk' // Buffered chunk flushed
    | 'scene:progress' // Progress update
    | 'scene:complete' // Scene finished
    | 'scene:error' // Scene failed
    | 'scene:skipped' // Scene was deduplicated
    | 'state:update' // Full reader state changed
    | 'stream:start' // Streaming batch started
    | 'stream:complete' // All scenes in batch finished
    | 'stream:cancel' // Streaming was cancelled
    | 'mode:change' // Reader mode switched
    | 'notification'; // Completion or info notification

export interface ReaderUpdate {
    type: ReaderUpdateType;
    /** Scene ID (for scene-specific events). */
    sceneId?: string;
    /** Token content (if emitting raw string stream). */
    content?: string;
    /** Parsed blocks (if emitting semantic chunks). */
    blocks?: CinematicBlock[];
    /** Chunk index within scene. */
    chunkIndex?: number;
    /** Progress ratio 0..1. */
    progress?: number;
    /** Error message. */
    error?: string;
    /** The full reader state snapshot at the time of the event. */
    state: ReaderState;
    /** Notification message (for 'notification' type). */
    message?: string;
    /** Provider info. */
    provider?: string;
    /** Timestamp (epoch ms). */
    timestamp: number;
}

export type ReaderUpdateHandler = (update: ReaderUpdate) => void;

/**
 * Typed publish/subscribe bus for reader UI updates.
 *
 * Decouples the render bridge from specific React components.
 * Any number of consumers can subscribe to specific event types
 * or use '*' for all events.
 */
export class ReaderUpdateBus {
    private readonly _listeners = new Map<ReaderUpdateType | '*', ReaderUpdateHandler[]>();
    private _paused = false;
    private readonly _buffer: ReaderUpdate[] = [];

    /** Subscribe to a specific event type or '*' for all. Returns unsubscribe fn. */
    on(type: ReaderUpdateType | '*', handler: ReaderUpdateHandler): () => void {
        if (!this._listeners.has(type)) {
            this._listeners.set(type, []);
        }
        this._listeners.get(type)!.push(handler);
        return () => this.off(type, handler);
    }

    /** Unsubscribe a handler. */
    off(type: ReaderUpdateType | '*', handler: ReaderUpdateHandler): void {
        const handlers = this._listeners.get(type);
        if (!handlers) return;
        const idx = handlers.indexOf(handler);
        if (idx !== -1) handlers.splice(idx, 1);
    }

    /** Emit an event to all matching listeners. */
    emit(update: ReaderUpdate): void {
        if (this._paused) {
            this._buffer.push(update);
            return;
        }
        this._dispatch(update);
    }

    /**
     * Pause event delivery. Events are buffered and replayed on resume.
     * Useful during React concurrent mode transitions.
     */
    pause(): void {
        this._paused = true;
    }

    /** Resume event delivery and flush buffered events. */
    resume(): void {
        this._paused = false;
        const buffered = this._buffer.splice(0);
        for (const update of buffered) {
            this._dispatch(update);
        }
    }

    /** Remove all listeners. */
    clear(): void {
        this._listeners.clear();
        this._buffer.length = 0;
        this._paused = false;
    }

    /** Number of total registered handlers. */
    get listenerCount(): number {
        let count = 0;
        for (const handlers of this._listeners.values()) {
            count += handlers.length;
        }
        return count;
    }

    private _dispatch(update: ReaderUpdate): void {
        const specific = this._listeners.get(update.type);
        if (specific) {
            for (const handler of specific) {
                try {
                    handler(update);
                } catch {
                    /* listener errors swallowed */
                }
            }
        }
        const wildcard = this._listeners.get('*');
        if (wildcard) {
            for (const handler of wildcard) {
                try {
                    handler(update);
                } catch {
                    /* listener errors swallowed */
                }
            }
        }
    }
}

// ─── STREAM EVENT ADAPTER ─────────────────────────────────────────────────────
//
// These types mirror the StreamSession event interface so RenderBridge
// can accept events without importing the AI layer directly.
// The consumer provides an adapter when binding a StreamSession.

export interface StreamEventLike {
    type: 'token' | 'chunk' | 'progress' | 'complete' | 'error' | 'retry';
    content?: string;
    blocks?: CinematicBlock[];
    chunkIndex?: number;
    tokenCount?: number;
    provider?: string;
    error?: string;
    retryAttempt?: number;
    elapsedMs?: number;
    ttftMs?: number;
}

export type StreamSessionLike = {
    readonly id: string;
    readonly isActive: boolean;
    readonly accumulated: string;
    readonly accumulatedBlocks?: CinematicBlock[];
    readonly tokenCount: number;
    readonly chunkCount: number;
    readonly ttftMs: number;
    readonly tokensPerSecond: number;
    readonly activeProvider: string;
    on(type: string, handler: (event: StreamEventLike) => void): () => void;
};

// ─── RENDER BRIDGE ────────────────────────────────────────────────────────────

export interface RenderBridgeConfig {
    /** Initial rendering mode. */
    mode?: ReaderRenderMode;
    /** Heuristic: average tokens per scene (for progress estimation). */
    estimatedTokensPerScene?: number;
    /** Throttle state:update emissions to this interval (ms). Default 50. */
    stateUpdateThrottleMs?: number;
}

const DEFAULT_TOKENS_PER_SCENE = 500;
const DEFAULT_STATE_THROTTLE_MS = 50;

/**
 * RenderBridge — Connects streaming AI output to the reader UI.
 *
 * Responsibilities:
 *   1. Manage per-scene SceneRenderState objects
 *   2. Convert stream events into reader updates
 *   3. Track global ReaderState (progress, mode, streaming status)
 *   4. Emit updates via ReaderUpdateBus
 *   5. Support mode switching without interrupting streams
 *
 * Usage:
 *   const bridge = new RenderBridge();
 *   bridge.bus.on('scene:token', (u) => renderPartialScene(u));
 *   bridge.bus.on('stream:complete', () => showCompletionToast());
 *   bridge.bindStream(streamSession, ['scene-1', 'scene-2']);
 */
export class RenderBridge {
    readonly bus: ReaderUpdateBus;
    private _state: ReaderState;
    private readonly _scenes = new Map<string, SceneRenderState>();
    private readonly _config: Required<RenderBridgeConfig>;
    private _unbindFns: (() => void)[] = [];
    private _lastStateEmit = 0;
    private _pendingStateEmit: ReturnType<typeof setTimeout> | null = null;

    // Track which scene is currently receiving tokens (for multi-scene routing)
    private _activeSceneId: string | null = null;

    constructor(config?: RenderBridgeConfig) {
        this._config = {
            mode: config?.mode ?? 'cinematized',
            estimatedTokensPerScene: config?.estimatedTokensPerScene ?? DEFAULT_TOKENS_PER_SCENE,
            stateUpdateThrottleMs: config?.stateUpdateThrottleMs ?? DEFAULT_STATE_THROTTLE_MS,
        };
        this.bus = new ReaderUpdateBus();
        this._state = createReaderState(this._config.mode);
    }

    // ─── Public API ─────────────────────────────────────────────────────

    /** Current reader state snapshot. */
    get state(): ReaderState {
        return this._state;
    }

    /** Switch rendering mode. Emits mode:change. */
    setMode(mode: ReaderRenderMode): void {
        if (this._state.mode === mode) return;
        this._state = { ...this._state, mode };
        this._emitUpdate({
            type: 'mode:change',
            state: this._state,
            timestamp: Date.now(),
        });
    }

    /**
     * Register scene IDs that will be streamed.
     * Call before bindStream() to pre-allocate render states.
     */
    registerScenes(sceneIds: string[], estimatedTokens?: number): void {
        for (const id of sceneIds) {
            if (!this._scenes.has(id)) {
                const scene = createSceneRenderState(
                    id,
                    estimatedTokens ?? this._config.estimatedTokensPerScene,
                );
                this._scenes.set(id, scene);
            }
        }
        this._syncState();
    }

    /**
     * Mark a scene as already processed (skip streaming).
     * Used for cache hits or deduplication.
     */
    skipScene(sceneId: string, content: string): void {
        const scene = this._getOrCreateScene(sceneId);
        scene.status = 'skipped';
        scene.accumulatedText = content;
        scene.progress = 1;
        scene.completedAt = Date.now();
        this._syncState();
        this._emitUpdate({
            type: 'scene:skipped',
            sceneId,
            content,
            blocks: scene.accumulatedBlocks,
            progress: 1,
            state: this._state,
            timestamp: Date.now(),
        });
    }

    /**
     * Set which scene is currently receiving tokens.
     * Tokens from the stream will be routed to this scene.
     */
    setActiveScene(sceneId: string): void {
        this._activeSceneId = sceneId;
        const scene = this._getOrCreateScene(sceneId);
        if (scene.status === 'pending') {
            scene.status = 'streaming';
            scene.startedAt = Date.now();
        }
        this._state = { ...this._state, currentSceneId: sceneId };
        this._emitUpdate({
            type: 'scene:start',
            sceneId,
            state: this._state,
            timestamp: Date.now(),
        });
    }

    /**
     * Bind a StreamSession to this bridge.
     *
     * Connects stream events to the render pipeline.
     * Optionally specify scene IDs for multi-scene routing.
     * If a single scene or no scenes specified, all tokens go to one scene.
     */
    bindStream(session: StreamSessionLike, sceneIds?: string[]): () => void {
        // Pre-register scenes if provided
        if (sceneIds && sceneIds.length > 0) {
            this.registerScenes(sceneIds);
            this.setActiveScene(sceneIds[0]);
        } else {
            // Single scene: use the session ID as the scene ID
            const implicitSceneId = `stream-${session.id}`;
            this.registerScenes([implicitSceneId]);
            this.setActiveScene(implicitSceneId);
        }

        // Mark streaming started
        this._state = {
            ...this._state,
            streaming: true,
            activeProvider: session.activeProvider || undefined,
        };
        this._emitUpdate({
            type: 'stream:start',
            state: this._state,
            timestamp: Date.now(),
        });

        // Bind to stream events
        const unsubs: (() => void)[] = [];

        unsubs.push(session.on('token', e => this._handleToken(e, session)));
        unsubs.push(session.on('chunk', e => this._handleChunk(e)));
        unsubs.push(session.on('progress', e => this._handleProgress(e, session)));
        unsubs.push(session.on('complete', () => this._handleComplete(session)));
        unsubs.push(session.on('error', e => this._handleError(e)));
        unsubs.push(session.on('retry', e => this._handleRetry(e)));

        const unbind = () => {
            for (const unsub of unsubs) unsub();
            const idx = this._unbindFns.indexOf(unbind);
            if (idx !== -1) this._unbindFns.splice(idx, 1);
        };

        this._unbindFns.push(unbind);
        return unbind;
    }

    /**
     * Cancel all active streams and mark remaining scenes as cancelled.
     */
    cancel(): void {
        // Mark incomplete scenes as error
        for (const scene of this._scenes.values()) {
            if (
                scene.status === 'streaming' ||
                scene.status === 'partial' ||
                scene.status === 'pending'
            ) {
                scene.status = 'error';
                scene.errorMessage = 'Cancelled by user';
            }
        }

        this._state = { ...this._state, streaming: false, error: 'Cancelled by user' };
        this._emitUpdate({
            type: 'stream:cancel',
            state: this._state,
            timestamp: Date.now(),
        });

        // Unbind all streams
        for (const unbind of [...this._unbindFns]) unbind();
    }

    /**
     * Get the render state for a specific scene.
     */
    getSceneState(sceneId: string): SceneRenderState | undefined {
        return this._scenes.get(sceneId);
    }

    /**
     * Reset the bridge to initial state. Unbinds all streams.
     */
    reset(): void {
        for (const unbind of [...this._unbindFns]) unbind();
        this._unbindFns.length = 0;
        this._scenes.clear();
        this._activeSceneId = null;
        if (this._pendingStateEmit !== null) {
            clearTimeout(this._pendingStateEmit);
            this._pendingStateEmit = null;
        }
        this._state = createReaderState(this._config.mode);
    }

    /**
     * Destroy the bridge — clears all listeners and resets state.
     */
    destroy(): void {
        this.reset();
        this.bus.clear();
    }

    // ─── Event Handlers ─────────────────────────────────────────────────

    private _handleToken(event: StreamEventLike, session: StreamSessionLike): void {
        const sceneId = this._activeSceneId;
        if (!sceneId) return;

        const scene = this._scenes.get(sceneId);
        if (!scene || scene.status === 'complete' || scene.status === 'skipped') return;

        // Update scene state
        scene.status = 'streaming';
        scene.accumulatedText += event.content ?? '';
        scene.tokenCount++;
        scene.provider = event.provider ?? session.activeProvider;

        // Estimate progress
        if (scene.estimatedTotalTokens > 0) {
            scene.progress = Math.min(0.99, scene.tokenCount / scene.estimatedTotalTokens);
        }

        // Emit per-token event (for live typing effects)
        this._emitUpdate({
            type: 'scene:token',
            sceneId,
            content: event.content,
            progress: scene.progress,
            state: this._state,
            provider: scene.provider,
            timestamp: Date.now(),
        });

        // Throttled global state sync
        this._scheduleStateSync(session);
    }

    private _handleChunk(event: StreamEventLike): void {
        const sceneId = this._activeSceneId;
        if (!sceneId) return;

        const scene = this._scenes.get(sceneId);
        if (!scene || scene.status === 'complete' || scene.status === 'skipped') return;

        scene.chunkCount++;

        if (event.blocks) {
            scene.accumulatedBlocks = (scene.accumulatedBlocks ?? []).concat(event.blocks);
        }

        this._emitUpdate({
            type: 'scene:chunk',
            sceneId,
            content: event.content,
            blocks: event.blocks,
            chunkIndex: event.chunkIndex,
            progress: scene.progress,
            state: this._state,
            timestamp: Date.now(),
        });
    }

    private _handleProgress(event: StreamEventLike, session: StreamSessionLike): void {
        // Global progress from stream session
        this._state = {
            ...this._state,
            totalTokens: event.tokenCount ?? session.tokenCount,
            ttftMs: event.ttftMs ?? session.ttftMs,
            tokensPerSecond: session.tokensPerSecond,
            activeProvider: event.provider ?? session.activeProvider,
        };

        const sceneId = this._activeSceneId;
        if (sceneId) {
            this._emitUpdate({
                type: 'scene:progress',
                sceneId,
                progress: this._scenes.get(sceneId)?.progress ?? 0,
                state: this._state,
                timestamp: Date.now(),
            });
        }
    }

    private _handleComplete(session: StreamSessionLike): void {
        // Complete the active scene
        const sceneId = this._activeSceneId;
        if (sceneId) {
            const scene = this._scenes.get(sceneId);
            if (scene && scene.status !== 'skipped') {
                scene.status = 'complete';
                scene.progress = 1;
                scene.completedAt = Date.now();
                scene.accumulatedText = session.accumulated;

                this._emitUpdate({
                    type: 'scene:complete',
                    sceneId,
                    content: scene.accumulatedText,
                    progress: 1,
                    state: this._state,
                    provider: scene.provider,
                    timestamp: Date.now(),
                });
            }
        }

        // Check if all scenes are done
        this._syncState();
        const allDone = this._areAllScenesFinished();

        if (allDone) {
            this._state = { ...this._state, streaming: false, progress: 1 };
            this._emitUpdate({
                type: 'stream:complete',
                state: this._state,
                message: `${this._state.completedScenes} scene(s) rendered.`,
                timestamp: Date.now(),
            });

            // Emit completion notification
            this._emitUpdate({
                type: 'notification',
                state: this._state,
                message: 'Cinematification complete!',
                timestamp: Date.now(),
            });
        }
    }

    private _handleError(event: StreamEventLike): void {
        const sceneId = this._activeSceneId;
        const errorMsg = event.error ?? 'Unknown stream error';

        if (sceneId) {
            const scene = this._scenes.get(sceneId);
            if (scene && scene.status !== 'complete' && scene.status !== 'skipped') {
                scene.status = 'error';
                scene.errorMessage = errorMsg;
            }
        }

        this._state = { ...this._state, error: errorMsg };
        this._syncState();

        this._emitUpdate({
            type: 'scene:error',
            sceneId: sceneId ?? undefined,
            error: errorMsg,
            state: this._state,
            timestamp: Date.now(),
        });
    }

    private _handleRetry(event: StreamEventLike): void {
        // Retries don't change scene state but we emit a notification
        const sceneId = this._activeSceneId;
        this._state = {
            ...this._state,
            activeProvider: event.provider,
        };

        this._emitUpdate({
            type: 'notification',
            sceneId: sceneId ?? undefined,
            state: this._state,
            message: `Provider retry #${event.retryAttempt ?? 0}…`,
            provider: event.provider,
            timestamp: Date.now(),
        });
    }

    // ─── Internal State Management ──────────────────────────────────────

    private _getOrCreateScene(sceneId: string): SceneRenderState {
        let scene = this._scenes.get(sceneId);
        if (!scene) {
            scene = createSceneRenderState(sceneId, this._config.estimatedTokensPerScene);
            this._scenes.set(sceneId, scene);
        }
        return scene;
    }

    /**
     * Rebuild the aggregate ReaderState from per-scene states.
     */
    private _syncState(): void {
        const scenes = this._scenes;
        let completed = 0;
        let totalProgress = 0;

        for (const scene of scenes.values()) {
            if (scene.status === 'complete' || scene.status === 'skipped') completed++;
            totalProgress += scene.progress;
        }

        const total = scenes.size;
        const progress = total > 0 ? totalProgress / total : 0;

        this._state = {
            ...this._state,
            scenes,
            completedScenes: completed,
            totalScenes: total,
            progress,
        };
    }

    /**
     * Throttled state:update emission to avoid flooding React.
     */
    private _scheduleStateSync(session: StreamSessionLike): void {
        const now = Date.now();
        const elapsed = now - this._lastStateEmit;

        if (elapsed >= this._config.stateUpdateThrottleMs) {
            this._flushStateSync(session);
        } else if (this._pendingStateEmit === null) {
            this._pendingStateEmit = setTimeout(() => {
                this._pendingStateEmit = null;
                this._flushStateSync(session);
            }, this._config.stateUpdateThrottleMs - elapsed);
        }
    }

    private _flushStateSync(session: StreamSessionLike): void {
        this._lastStateEmit = Date.now();
        this._state = {
            ...this._state,
            totalTokens: session.tokenCount,
            ttftMs: session.ttftMs,
            tokensPerSecond: session.tokensPerSecond,
            activeProvider: session.activeProvider,
        };
        this._syncState();
        this._emitUpdate({
            type: 'state:update',
            state: this._state,
            timestamp: Date.now(),
        });
    }

    private _areAllScenesFinished(): boolean {
        for (const scene of this._scenes.values()) {
            if (
                scene.status === 'pending' ||
                scene.status === 'streaming' ||
                scene.status === 'partial'
            ) {
                return false;
            }
        }
        return this._scenes.size > 0;
    }

    private _emitUpdate(update: ReaderUpdate): void {
        this.bus.emit(update);
    }
}

// ─── CONVENIENCE: streamToRenderer() ──────────────────────────────────────────

export interface StreamToRendererOptions {
    /** Scene IDs for multi-scene routing. */
    sceneIds?: string[];
    /** Rendering mode. */
    mode?: ReaderRenderMode;
    /** Estimated tokens per scene for progress bar accuracy. */
    estimatedTokensPerScene?: number;
    /** Handler for per-scene token arrival. */
    onToken?: (sceneId: string, content: string, progress: number) => void;
    /** Handler for buffered chunk flush. */
    onChunk?: (sceneId: string, content: string, chunkIndex: number) => void;
    /** Handler for scene completion. */
    onSceneComplete?: (sceneId: string, content: string) => void;
    /** Handler when all scenes are done. */
    onComplete?: (state: ReaderState) => void;
    /** Handler for errors. */
    onError?: (error: string, sceneId?: string) => void;
    /** Handler for progress updates. */
    onProgress?: (progress: number, state: ReaderState) => void;
    /** Handler for notifications (retry, completion, etc.). */
    onNotification?: (message: string) => void;
}

/**
 * Convenience function that creates a RenderBridge, binds a StreamSession,
 * and wires up all callbacks in one call.
 *
 * Returns the bridge (for manual control) and an unbind function.
 *
 * Usage:
 * ```ts
 * import { streamResponse } from 'lib/ai';
 * import { streamToRenderer } from 'lib/rendering';
 *
 * const { session } = streamResponse(prompt, config);
 *
 * const { bridge, unbind } = streamToRenderer(session, {
 *     sceneIds: ['scene-1', 'scene-2'],
 *     onToken: (sceneId, text, progress) => {
 *         dispatch({ type: 'SCENE_TOKEN', sceneId, text, progress });
 *     },
 *     onSceneComplete: (sceneId, content) => {
 *         parseAndRenderBlocks(sceneId, content);
 *     },
 *     onComplete: (state) => {
 *         showToast('All scenes rendered!');
 *     },
 * });
 *
 * // Cancel at any time:
 * bridge.cancel();
 * ```
 */
export function streamToRenderer(
    session: StreamSessionLike,
    options?: StreamToRendererOptions,
): { bridge: RenderBridge; unbind: () => void } {
    const bridge = new RenderBridge({
        mode: options?.mode,
        estimatedTokensPerScene: options?.estimatedTokensPerScene,
    });

    // Wire callbacks
    if (options?.onToken) {
        bridge.bus.on('scene:token', u => {
            if (u.sceneId && u.content !== undefined) {
                options.onToken!(u.sceneId, u.content, u.progress ?? 0);
            }
        });
    }

    if (options?.onChunk) {
        bridge.bus.on('scene:chunk', u => {
            if (u.sceneId && u.content !== undefined) {
                options.onChunk!(u.sceneId, u.content, u.chunkIndex ?? 0);
            }
        });
    }

    if (options?.onSceneComplete) {
        bridge.bus.on('scene:complete', u => {
            if (u.sceneId && u.content !== undefined) {
                options.onSceneComplete!(u.sceneId, u.content);
            }
        });
    }

    if (options?.onComplete) {
        bridge.bus.on('stream:complete', u => {
            options.onComplete!(u.state);
        });
    }

    if (options?.onError) {
        bridge.bus.on('scene:error', u => {
            options.onError!(u.error ?? 'Unknown error', u.sceneId);
        });
    }

    if (options?.onProgress) {
        bridge.bus.on('state:update', u => {
            options.onProgress!(u.state.progress, u.state);
        });
    }

    if (options?.onNotification) {
        bridge.bus.on('notification', u => {
            if (u.message) options.onNotification!(u.message);
        });
    }

    // Bind the stream
    const unbindStream = bridge.bindStream(session, options?.sceneIds);

    const unbind = () => {
        unbindStream();
        bridge.destroy();
    };

    return { bridge, unbind };
}
