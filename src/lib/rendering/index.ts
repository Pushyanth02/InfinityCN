/**
 * rendering/index.ts — Rendering Module Barrel Export
 *
 * Re-exports all rendering integration components.
 */

export {
    RenderBridge,
    ReaderUpdateBus,
    createReaderState,
    createSceneRenderState,
    streamToRenderer,
} from './renderBridge';

export type {
    ReaderRenderMode,
    SceneRenderStatus,
    SceneRenderState,
    ReaderState,
    ReaderUpdateType,
    ReaderUpdate,
    ReaderUpdateHandler,
    StreamEventLike,
    StreamSessionLike,
    RenderBridgeConfig,
    StreamToRendererOptions,
} from './renderBridge';
