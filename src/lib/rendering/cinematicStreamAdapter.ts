import type { StreamEventLike, StreamSessionLike } from './renderBridge';
import type { CinematicBlock } from '../../types/cinematifier';

/**
 * CinematicStreamAdapter
 *
 * Adapts the chunk-based (CinematicBlock[]) callbacks from `runFullSystemPipeline`
 * to the generic `StreamSessionLike` event interface expected by `RenderBridge`.
 */
export class CinematicStreamAdapter implements StreamSessionLike {
    readonly id = `cinematic-stream-${Date.now()}`;
    isActive = false;
    accumulated = '';
    accumulatedBlocks: CinematicBlock[] = [];
    tokenCount = 0;
    chunkCount = 0;
    ttftMs = 0;
    tokensPerSecond = 0;
    activeProvider = '';

    private listeners = new Map<string, ((event: StreamEventLike) => void)[]>();

    on(type: string, handler: (event: StreamEventLike) => void): () => void {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, []);
        }
        this.listeners.get(type)!.push(handler);
        return () => {
            const arr = this.listeners.get(type);
            if (arr) {
                const idx = arr.indexOf(handler);
                if (idx !== -1) arr.splice(idx, 1);
            }
        };
    }

    emit(event: StreamEventLike): void {
        const arr = this.listeners.get(event.type);
        if (arr) {
            for (const handler of arr) {
                handler(event);
            }
        }
    }

    start(providerName: string): void {
        this.isActive = true;
        this.activeProvider = providerName;
    }

    pushChunk(blocks: CinematicBlock[]): void {
        this.isActive = true;
        this.accumulatedBlocks = this.accumulatedBlocks.concat(blocks);
        this.chunkCount++;
        this.emit({
            type: 'chunk',
            blocks,
            chunkIndex: this.chunkCount,
            provider: this.activeProvider,
        });
    }

    complete(): void {
        this.isActive = false;
        this.emit({ type: 'complete' });
    }

    error(errMessage: string): void {
        this.isActive = false;
        this.emit({ type: 'error', error: errMessage });
    }
}
