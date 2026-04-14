import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    RenderBridge,
    ReaderUpdateBus,
    createReaderState,
    createSceneRenderState,
    streamToRenderer,
} from '../rendering/renderBridge';
import type { ReaderUpdate, StreamSessionLike, StreamEventLike } from '../rendering/renderBridge';

type MockStreamSession = Omit<StreamSessionLike, 'accumulated'> & {
    accumulated: string;
    _emit: (type: string, event: Partial<StreamEventLike>) => void;
    _handlers: Map<string, ((e: StreamEventLike) => void)[]>;
};

// ─── Mock StreamSession ───────────────────────────────────────────────────────

function createMockSession(id = 'test-session'): MockStreamSession {
    const handlers = new Map<string, ((e: StreamEventLike) => void)[]>();

    const session = {
        id,
        isActive: true,
        _accumulated: '',
        get accumulated() {
            return this._accumulated;
        },
        set accumulated(val: string) {
            this._accumulated = val;
        },
        tokenCount: 0,
        chunkCount: 0,
        ttftMs: 0,
        tokensPerSecond: 0,
        activeProvider: 'openai',
        _handlers: handlers,

        on(type: string, handler: (event: StreamEventLike) => void): () => void {
            if (!handlers.has(type)) handlers.set(type, []);
            handlers.get(type)!.push(handler);
            return () => {
                const list = handlers.get(type);
                if (list) {
                    const idx = list.indexOf(handler);
                    if (idx !== -1) list.splice(idx, 1);
                }
            };
        },

        _emit(type: string, event: Partial<StreamEventLike> = {}) {
            const list = handlers.get(type);
            if (list) {
                for (const h of list) {
                    h({ type: type as StreamEventLike['type'], ...event });
                }
            }
        },
    };

    return session;
}

// ─── ReaderUpdateBus ──────────────────────────────────────────────────────────

describe('ReaderUpdateBus', () => {
    let bus: ReaderUpdateBus;

    beforeEach(() => {
        bus = new ReaderUpdateBus();
    });

    it('delivers events to specific listeners', () => {
        const events: ReaderUpdate[] = [];
        bus.on('scene:token', u => events.push(u));

        const update: ReaderUpdate = {
            type: 'scene:token',
            state: createReaderState(),
            timestamp: Date.now(),
        };
        bus.emit(update);

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('scene:token');
    });

    it('delivers events to wildcard listeners', () => {
        const events: ReaderUpdate[] = [];
        bus.on('*', u => events.push(u));

        bus.emit({ type: 'scene:token', state: createReaderState(), timestamp: Date.now() });
        bus.emit({ type: 'scene:complete', state: createReaderState(), timestamp: Date.now() });

        expect(events).toHaveLength(2);
    });

    it('does not deliver to unsubscribed listeners', () => {
        const events: ReaderUpdate[] = [];
        const unsub = bus.on('scene:token', u => events.push(u));
        unsub();

        bus.emit({ type: 'scene:token', state: createReaderState(), timestamp: Date.now() });
        expect(events).toHaveLength(0);
    });

    it('buffers events when paused and replays on resume', () => {
        const events: ReaderUpdate[] = [];
        bus.on('scene:token', u => events.push(u));

        bus.pause();
        bus.emit({ type: 'scene:token', state: createReaderState(), timestamp: 1 });
        bus.emit({ type: 'scene:token', state: createReaderState(), timestamp: 2 });

        expect(events).toHaveLength(0); // Paused

        bus.resume();
        expect(events).toHaveLength(2); // Replayed
    });

    it('clear removes all listeners', () => {
        bus.on('scene:token', () => {});
        bus.on('*', () => {});
        expect(bus.listenerCount).toBe(2);

        bus.clear();
        expect(bus.listenerCount).toBe(0);
    });

    it('swallows listener errors', () => {
        bus.on('scene:token', () => {
            throw new Error('boom');
        });
        bus.on('scene:token', () => {}); // Should still receive

        // Should not throw
        expect(() => {
            bus.emit({ type: 'scene:token', state: createReaderState(), timestamp: Date.now() });
        }).not.toThrow();
    });
});

// ─── createSceneRenderState ───────────────────────────────────────────────────

describe('createSceneRenderState', () => {
    it('creates a pending scene with defaults', () => {
        const scene = createSceneRenderState('scene-1');
        expect(scene.sceneId).toBe('scene-1');
        expect(scene.status).toBe('pending');
        expect(scene.accumulatedText).toBe('');
        expect(scene.tokenCount).toBe(0);
        expect(scene.progress).toBe(0);
    });

    it('accepts estimated total tokens', () => {
        const scene = createSceneRenderState('scene-1', 1000);
        expect(scene.estimatedTotalTokens).toBe(1000);
    });
});

// ─── createReaderState ────────────────────────────────────────────────────────

describe('createReaderState', () => {
    it('creates default cinematized mode state', () => {
        const state = createReaderState();
        expect(state.mode).toBe('cinematized');
        expect(state.streaming).toBe(false);
        expect(state.progress).toBe(0);
        expect(state.currentSceneId).toBeNull();
    });

    it('accepts mode parameter', () => {
        const state = createReaderState('original');
        expect(state.mode).toBe('original');
    });
});

// ─── RenderBridge ─────────────────────────────────────────────────────────────

describe('RenderBridge', () => {
    let bridge: RenderBridge;
    let session: ReturnType<typeof createMockSession>;

    beforeEach(() => {
        bridge = new RenderBridge({ stateUpdateThrottleMs: 0 });
        session = createMockSession();
    });

    afterEach(() => {
        bridge.destroy();
    });

    it('initializes with default state', () => {
        expect(bridge.state.mode).toBe('cinematized');
        expect(bridge.state.streaming).toBe(false);
        expect(bridge.state.progress).toBe(0);
    });

    it('setMode emits mode:change', () => {
        const events: ReaderUpdate[] = [];
        bridge.bus.on('mode:change', u => events.push(u));

        bridge.setMode('original');

        expect(events).toHaveLength(1);
        expect(bridge.state.mode).toBe('original');
    });

    it('setMode is idempotent', () => {
        const events: ReaderUpdate[] = [];
        bridge.bus.on('mode:change', u => events.push(u));

        bridge.setMode('cinematized'); // Same as default
        expect(events).toHaveLength(0);
    });

    it('registerScenes pre-allocates scene states', () => {
        bridge.registerScenes(['s1', 's2', 's3']);

        expect(bridge.getSceneState('s1')).toBeDefined();
        expect(bridge.getSceneState('s1')!.status).toBe('pending');
        expect(bridge.state.totalScenes).toBe(3);
    });

    it('skipScene marks scene as skipped with content', () => {
        const events: ReaderUpdate[] = [];
        bridge.bus.on('scene:skipped', u => events.push(u));

        bridge.skipScene('s1', 'cached content');

        const scene = bridge.getSceneState('s1');
        expect(scene!.status).toBe('skipped');
        expect(scene!.accumulatedText).toBe('cached content');
        expect(scene!.progress).toBe(1);
        expect(events).toHaveLength(1);
        expect(events[0].content).toBe('cached content');
    });

    // ─── bindStream ──────────────────────────────────────────────────────

    it('bindStream emits stream:start', () => {
        const events: ReaderUpdate[] = [];
        bridge.bus.on('stream:start', u => events.push(u));

        bridge.bindStream(session, ['scene-1']);

        expect(events).toHaveLength(1);
        expect(bridge.state.streaming).toBe(true);
    });

    it('bindStream creates implicit scene when no sceneIds', () => {
        bridge.bindStream(session);

        expect(bridge.state.currentSceneId).toBe(`stream-${session.id}`);
        expect(bridge.state.totalScenes).toBe(1);
    });

    it('routes token events to active scene', () => {
        const tokens: ReaderUpdate[] = [];
        bridge.bus.on('scene:token', u => tokens.push(u));

        bridge.bindStream(session, ['scene-1']);
        session._emit('token', { content: 'Hello' });

        expect(tokens).toHaveLength(1);
        expect(tokens[0].content).toBe('Hello');
        expect(tokens[0].sceneId).toBe('scene-1');

        const scene = bridge.getSceneState('scene-1');
        expect(scene!.accumulatedText).toBe('Hello');
        expect(scene!.tokenCount).toBe(1);
        expect(scene!.status).toBe('streaming');
    });

    it('accumulates tokens in scene state', () => {
        bridge.bindStream(session, ['scene-1']);

        session._emit('token', { content: 'The ' });
        session._emit('token', { content: 'quick ' });
        session._emit('token', { content: 'fox.' });

        const scene = bridge.getSceneState('scene-1');
        expect(scene!.accumulatedText).toBe('The quick fox.');
        expect(scene!.tokenCount).toBe(3);
    });

    it('routes chunk events to active scene', () => {
        const chunks: ReaderUpdate[] = [];
        bridge.bus.on('scene:chunk', u => chunks.push(u));

        bridge.bindStream(session, ['scene-1']);
        session._emit('chunk', { content: 'First chunk', chunkIndex: 0 });

        expect(chunks).toHaveLength(1);
        expect(chunks[0].content).toBe('First chunk');
        expect(chunks[0].chunkIndex).toBe(0);
    });

    it('handles completion and emits scene:complete + stream:complete', () => {
        const sceneCompletes: ReaderUpdate[] = [];
        const streamCompletes: ReaderUpdate[] = [];
        bridge.bus.on('scene:complete', u => sceneCompletes.push(u));
        bridge.bus.on('stream:complete', u => streamCompletes.push(u));

        bridge.bindStream(session, ['scene-1']);
        session.accumulated = 'Full output text';
        session._emit('complete', {});

        expect(sceneCompletes).toHaveLength(1);
        expect(sceneCompletes[0].sceneId).toBe('scene-1');
        expect(sceneCompletes[0].progress).toBe(1);

        const scene = bridge.getSceneState('scene-1');
        expect(scene!.status).toBe('complete');
        expect(scene!.accumulatedText).toBe('Full output text');

        // Single scene → stream:complete fires too
        expect(streamCompletes).toHaveLength(1);
        expect(bridge.state.streaming).toBe(false);
    });

    it('emits notification on completion', () => {
        const notifications: ReaderUpdate[] = [];
        bridge.bus.on('notification', u => notifications.push(u));

        bridge.bindStream(session, ['scene-1']);
        session._emit('complete', {});

        expect(notifications.some(n => n.message === 'Cinematification complete!')).toBe(true);
    });

    it('handles stream errors and emits scene:error', () => {
        const errors: ReaderUpdate[] = [];
        bridge.bus.on('scene:error', u => errors.push(u));

        bridge.bindStream(session, ['scene-1']);
        session._emit('error', { error: 'Provider timeout' });

        expect(errors).toHaveLength(1);
        expect(errors[0].error).toBe('Provider timeout');

        const scene = bridge.getSceneState('scene-1');
        expect(scene!.status).toBe('error');
        expect(scene!.errorMessage).toBe('Provider timeout');
    });

    it('handles retry events as notifications', () => {
        const notifications: ReaderUpdate[] = [];
        bridge.bus.on('notification', u => notifications.push(u));

        bridge.bindStream(session, ['scene-1']);
        session._emit('retry', { retryAttempt: 2, provider: 'gemini' });

        expect(notifications).toHaveLength(1);
        expect(notifications[0].message).toContain('retry #2');
        expect(notifications[0].provider).toBe('gemini');
    });

    it('cancel marks streaming scenes as error', () => {
        const cancels: ReaderUpdate[] = [];
        bridge.bus.on('stream:cancel', u => cancels.push(u));

        bridge.bindStream(session, ['scene-1', 'scene-2']);
        session._emit('token', { content: 'partial' }); // scene-1 gets streaming status

        bridge.cancel();

        expect(cancels).toHaveLength(1);
        expect(bridge.state.streaming).toBe(false);

        const scene1 = bridge.getSceneState('scene-1');
        expect(scene1!.status).toBe('error');
        expect(scene1!.errorMessage).toBe('Cancelled by user');

        const scene2 = bridge.getSceneState('scene-2');
        expect(scene2!.status).toBe('error'); // Was pending, now error
    });

    it('unbind stops processing events', () => {
        const tokens: ReaderUpdate[] = [];
        bridge.bus.on('scene:token', u => tokens.push(u));

        const unbind = bridge.bindStream(session, ['scene-1']);

        session._emit('token', { content: 'before' });
        expect(tokens).toHaveLength(1);

        unbind();

        session._emit('token', { content: 'after' });
        expect(tokens).toHaveLength(1); // No new events
    });

    it('reset clears all state', () => {
        bridge.bindStream(session, ['scene-1']);
        session._emit('token', { content: 'data' });

        bridge.reset();

        expect(bridge.state.streaming).toBe(false);
        expect(bridge.state.totalScenes).toBe(0);
        expect(bridge.getSceneState('scene-1')).toBeUndefined();
    });

    // ─── Progress Estimation ─────────────────────────────────────────────

    it('estimates scene progress from token count', () => {
        bridge = new RenderBridge({
            estimatedTokensPerScene: 100,
            stateUpdateThrottleMs: 0,
        });

        bridge.bindStream(session, ['scene-1']);

        for (let i = 0; i < 50; i++) {
            session._emit('token', { content: 'x' });
        }

        const scene = bridge.getSceneState('scene-1');
        expect(scene!.progress).toBeCloseTo(0.5);
    });

    it('caps scene progress at 0.99 during streaming', () => {
        bridge = new RenderBridge({
            estimatedTokensPerScene: 10,
            stateUpdateThrottleMs: 0,
        });

        bridge.bindStream(session, ['scene-1']);

        for (let i = 0; i < 20; i++) {
            session._emit('token', { content: 'x' });
        }

        const scene = bridge.getSceneState('scene-1');
        expect(scene!.progress).toBe(0.99); // Capped until complete
    });

    // ─── Multi-Scene ─────────────────────────────────────────────────────

    it('supports multiple scenes with manual scene switching', () => {
        bridge.registerScenes(['scene-1', 'scene-2']);
        bridge.bindStream(session, ['scene-1']);

        session._emit('token', { content: 'First scene text' });

        // Switch to scene-2
        bridge.setActiveScene('scene-2');
        session._emit('token', { content: 'Second scene text' });

        expect(bridge.getSceneState('scene-1')!.accumulatedText).toBe('First scene text');
        expect(bridge.getSceneState('scene-2')!.accumulatedText).toBe('Second scene text');
    });

    it('does not route tokens to completed scenes', () => {
        bridge.bindStream(session, ['scene-1']);
        session.accumulated = 'done';
        session._emit('complete', {});

        // Attempt to send more tokens — should be ignored
        session._emit('token', { content: 'extra' });

        const scene = bridge.getSceneState('scene-1');
        expect(scene!.status).toBe('complete');
        expect(scene!.accumulatedText).toBe('done'); // Unchanged
    });

    it('does not route tokens to skipped scenes', () => {
        bridge.skipScene('scene-1', 'cached');
        bridge.bindStream(session, ['scene-1']);
        session._emit('token', { content: 'extra' });

        const scene = bridge.getSceneState('scene-1');
        expect(scene!.accumulatedText).toBe('cached'); // Unchanged
    });
});

// ─── streamToRenderer ─────────────────────────────────────────────────────────

describe('streamToRenderer', () => {
    it('wires callbacks and returns bridge', () => {
        const session = createMockSession();
        const tokens: [string, string, number][] = [];
        const completions: string[] = [];
        const allDone: boolean[] = [];

        const { unbind } = streamToRenderer(session, {
            sceneIds: ['s1'],
            onToken: (sceneId, content, progress) => {
                tokens.push([sceneId, content, progress]);
            },
            onSceneComplete: (_sceneId, content) => {
                completions.push(content);
            },
            onComplete: () => {
                allDone.push(true);
            },
        });

        session._emit('token', { content: 'Hello' });
        expect(tokens).toHaveLength(1);
        expect(tokens[0][0]).toBe('s1');
        expect(tokens[0][1]).toBe('Hello');

        session.accumulated = 'Hello world';
        session._emit('complete', {});
        expect(completions).toHaveLength(1);
        expect(completions[0]).toBe('Hello world');
        expect(allDone).toHaveLength(1);

        unbind();
    });

    it('wires error callback', () => {
        const session = createMockSession();
        const errors: [string, string | undefined][] = [];

        const { unbind } = streamToRenderer(session, {
            sceneIds: ['s1'],
            onError: (error, sceneId) => {
                errors.push([error, sceneId]);
            },
        });

        session._emit('error', { error: 'boom' });
        expect(errors).toHaveLength(1);
        expect(errors[0][0]).toBe('boom');
        expect(errors[0][1]).toBe('s1');

        unbind();
    });

    it('wires notification callback', () => {
        const session = createMockSession();
        const notifications: string[] = [];

        const { unbind } = streamToRenderer(session, {
            sceneIds: ['s1'],
            onNotification: msg => {
                notifications.push(msg);
            },
        });

        session._emit('retry', { retryAttempt: 1 });
        expect(notifications).toHaveLength(1);
        expect(notifications[0]).toContain('retry #1');

        unbind();
    });

    it('cleans up bridge on unbind', () => {
        const session = createMockSession();
        const { bridge, unbind } = streamToRenderer(session, { sceneIds: ['s1'] });

        unbind();
        expect(bridge.bus.listenerCount).toBe(0);
    });
});
