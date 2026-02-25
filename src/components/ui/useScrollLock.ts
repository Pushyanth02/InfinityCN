import { useEffect } from 'react';

/**
 * Ref-counted body scroll lock.
 * Multiple overlays can independently lock/unlock without clobbering each other.
 */
let lockCount = 0;

function lock(): void {
    lockCount++;
    if (lockCount === 1) {
        document.body.style.overflow = 'hidden';
    }
}

function unlock(): void {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
        document.body.style.overflow = '';
    }
}

/** Lock body scroll while `active` is true. Supports nesting. */
export function useScrollLock(active: boolean): void {
    useEffect(() => {
        if (!active) return;
        lock();
        return unlock;
    }, [active]);
}
