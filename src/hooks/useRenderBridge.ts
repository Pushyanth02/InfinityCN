/**
 * useRenderBridge — React hook for the Render Bridge
 *
 * Provides reactive access to the streaming render state.
 * Automatically manages bridge lifecycle and cleanup.
 *
 * Usage:
 * ```tsx
 * const {
 *     readerState,
 *     sceneState,
 *     bridge,
 *     isStreaming,
 *     progress,
 *     bindStream,
 *     cancel,
 *     setMode,
 * } = useRenderBridge({ mode: 'cinematized' });
 *
 * // In a streaming handler:
 * bindStream(streamSession, ['scene-1', 'scene-2']);
 *
 * // In JSX:
 * <ProgressBar value={progress} />
 * {isStreaming && <Spinner />}
 * <SceneView text={sceneState('scene-1')?.accumulatedText ?? ''} />
 * ```
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
    RenderBridge,
    type RenderBridgeConfig,
    type ReaderState,
    type ReaderRenderMode,
    type SceneRenderState,
    type StreamSessionLike,
    type ReaderUpdate,
    type ReaderUpdateType,
} from '../lib/rendering/renderBridge';

export interface UseRenderBridgeOptions {
    /** Initial rendering mode. */
    mode?: ReaderRenderMode;
    /** Estimated tokens per scene for progress bar accuracy. */
    estimatedTokensPerScene?: number;
    /** State update throttle (ms). Default 50. */
    stateUpdateThrottleMs?: number;
    /** Called on every reader state change. */
    onStateChange?: (state: ReaderState) => void;
    /** Called when all scenes complete. */
    onComplete?: (state: ReaderState) => void;
    /** Called on error. */
    onError?: (error: string, sceneId?: string) => void;
    /** Called on notification (retry info, completion toast, etc). */
    onNotification?: (message: string) => void;
}

export interface UseRenderBridgeReturn {
    /** Current aggregate reader state. */
    readerState: ReaderState;
    /** Get render state for a specific scene. */
    sceneState: (sceneId: string) => SceneRenderState | undefined;
    /** The underlying RenderBridge instance. */
    bridge: RenderBridge;
    /** Whether any scene is actively streaming. */
    isStreaming: boolean;
    /** Overall progress 0..1. */
    progress: number;
    /** Current rendering mode. */
    mode: ReaderRenderMode;
    /** Bind a stream session to the bridge. Returns unbind fn. */
    bindStream: (session: StreamSessionLike, sceneIds?: string[]) => () => void;
    /** Cancel all active streams. */
    cancel: () => void;
    /** Switch rendering mode. */
    setMode: (mode: ReaderRenderMode) => void;
    /** Reset the bridge to initial state. */
    reset: () => void;
    /** Register a handler for specific reader update types. Returns unsub fn. */
    on: (type: ReaderUpdateType | '*', handler: (update: ReaderUpdate) => void) => () => void;
    /** Mark a scene as already processed (cache hit). */
    skipScene: (sceneId: string, content: string) => void;
    /** Number of completed scenes. */
    completedScenes: number;
    /** Total number of tracked scenes. */
    totalScenes: number;
    /** Current error, if any. */
    error?: string;
    /** Active provider name. */
    activeProvider?: string;
    /** Time to first token (ms). */
    ttftMs: number;
    /** Tokens per second throughput. */
    tokensPerSecond: number;
}

export function useRenderBridge(options?: UseRenderBridgeOptions): UseRenderBridgeReturn {
    // Keep a single bridge instance for the hook lifecycle.
    const [bridge] = useState(
        () =>
            new RenderBridge({
                mode: options?.mode ?? 'cinematized',
                estimatedTokensPerScene: options?.estimatedTokensPerScene,
                stateUpdateThrottleMs: options?.stateUpdateThrottleMs,
            } as RenderBridgeConfig),
    );

    // React state mirror of the bridge's reader state
    const [readerState, setReaderState] = useState<ReaderState>(() => bridge.state);

    // Bind bus listeners on mount, unbind on unmount
    useEffect(() => {
        const unsubs: (() => void)[] = [];

        // State updates → React state
        unsubs.push(
            bridge.bus.on('state:update', u => {
                setReaderState({ ...u.state });
                options?.onStateChange?.(u.state);
            }),
        );

        // Scene starts/completes also trigger state refresh
        unsubs.push(
            bridge.bus.on('scene:start', u => {
                setReaderState({ ...u.state });
            }),
        );

        unsubs.push(
            bridge.bus.on('scene:complete', u => {
                setReaderState({ ...u.state });
            }),
        );

        unsubs.push(
            bridge.bus.on('scene:error', u => {
                setReaderState({ ...u.state });
                if (u.error) options?.onError?.(u.error, u.sceneId);
            }),
        );

        unsubs.push(
            bridge.bus.on('scene:skipped', u => {
                setReaderState({ ...u.state });
            }),
        );

        unsubs.push(
            bridge.bus.on('stream:complete', u => {
                setReaderState({ ...u.state });
                options?.onComplete?.(u.state);
            }),
        );

        unsubs.push(
            bridge.bus.on('stream:cancel', u => {
                setReaderState({ ...u.state });
            }),
        );

        unsubs.push(
            bridge.bus.on('mode:change', u => {
                setReaderState({ ...u.state });
            }),
        );

        unsubs.push(
            bridge.bus.on('notification', u => {
                if (u.message) options?.onNotification?.(u.message);
            }),
        );

        return () => {
            for (const unsub of unsubs) unsub();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- bridge is stable
    }, [bridge]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            bridge.destroy();
        };
    }, [bridge]);

    // Memoized callbacks
    const bindStream = useCallback(
        (session: StreamSessionLike, sceneIds?: string[]) => {
            return bridge.bindStream(session, sceneIds);
        },
        [bridge],
    );

    const cancel = useCallback(() => {
        bridge.cancel();
        setReaderState({ ...bridge.state });
    }, [bridge]);

    const setMode = useCallback(
        (mode: ReaderRenderMode) => {
            bridge.setMode(mode);
        },
        [bridge],
    );

    const reset = useCallback(() => {
        bridge.reset();
        setReaderState({ ...bridge.state });
    }, [bridge]);

    const sceneState = useCallback((sceneId: string) => bridge.getSceneState(sceneId), [bridge]);

    const on = useCallback(
        (type: ReaderUpdateType | '*', handler: (update: ReaderUpdate) => void) => {
            return bridge.bus.on(type, handler);
        },
        [bridge],
    );

    const skipScene = useCallback(
        (sceneId: string, content: string) => {
            bridge.skipScene(sceneId, content);
        },
        [bridge],
    );

    // Derived values
    return useMemo(
        () => ({
            readerState,
            sceneState,
            bridge,
            isStreaming: readerState.streaming,
            progress: readerState.progress,
            mode: readerState.mode,
            bindStream,
            cancel,
            setMode,
            reset,
            on,
            skipScene,
            completedScenes: readerState.completedScenes,
            totalScenes: readerState.totalScenes,
            error: readerState.error,
            activeProvider: readerState.activeProvider,
            ttftMs: readerState.ttftMs,
            tokensPerSecond: readerState.tokensPerSecond,
        }),
        [readerState, sceneState, bridge, bindStream, cancel, setMode, reset, on, skipScene],
    );
}
