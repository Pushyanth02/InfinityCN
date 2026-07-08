/**
 * Lemniscate — In-process Event Bus
 * ----------------------------------------------------------------------------
 * Simple pub/sub for ProgressEvents. The worker publishes; the websocket
 * service subscribes (via this module when co-located, or via Redis pub/sub
 * in a multi-process deployment).
 *
 * Bounded: history is capped per-job (200) AND globally (max 50 jobs tracked).
 * Listeners receive cloned events so they cannot mutate shared state.
 *
 * Spec 2.15: logs warning when events are evicted from the ring buffer.
 */

import type { ProgressEvent } from '../types'
import { createLogger } from '../logger'

type Listener = (evt: ProgressEvent) => void

const MAX_EVENTS_PER_JOB = 200
const MAX_TRACKED_JOBS = 50

const logger = createLogger('event-bus')

class EventBus {
  private listeners = new Map<string, Set<Listener>>()   // by jobId
  private globalListeners = new Set<Listener>()
  private history = new Map<string, ProgressEvent[]>()    // by jobId (ring buffer)
  private jobOrder: string[] = []                          // FIFO for eviction

  subscribe(jobId: string, listener: Listener): () => void {
    let set = this.listeners.get(jobId)
    if (!set) {
      set = new Set()
      this.listeners.set(jobId, set)
    }
    set.add(listener)
    return () => {
      set?.delete(listener)
      if (set && set.size === 0) this.listeners.delete(jobId)
    }
  }

  subscribeAll(listener: Listener): () => void {
    this.globalListeners.add(listener)
    return () => this.globalListeners.delete(listener)
  }

  publish(evt: ProgressEvent): void {
    // Clone so listeners can't mutate the shared event.
    const clone = { ...evt }

    // ring buffer (last MAX_EVENTS_PER_JOB per job)
    let h = this.history.get(evt.jobId)
    if (!h) {
      h = []
      this.history.set(evt.jobId, h)
      this.jobOrder.push(evt.jobId)
      // evict oldest jobs if we're tracking too many
      while (this.jobOrder.length > MAX_TRACKED_JOBS) {
        const old = this.jobOrder.shift()!
        this.history.delete(old)
        logger.warn('Event history evicted for job due to capacity', { evictedJobId: old })
        // keep listeners (they may still be subscribed); only drop history
      }
    }
    h.push(clone)
    if (h.length > MAX_EVENTS_PER_JOB) {
      const dropped = h.length - MAX_EVENTS_PER_JOB
      h.splice(0, dropped)
      logger.warn('Event ring buffer overflow — oldest events dropped', {
        jobId: evt.jobId,
        droppedCount: dropped,
      })
    }

    const set = this.listeners.get(evt.jobId)
    if (set) for (const l of set) {
      try { l(clone) } catch { /* swallow listener errors */ }
    }
    for (const l of this.globalListeners) {
      try { l(clone) } catch { /* swallow */ }
    }
  }

  historyFor(jobId: string): ProgressEvent[] {
    return this.history.get(jobId) ?? []
  }

  clear(jobId: string): void {
    this.listeners.delete(jobId)
    this.history.delete(jobId)
    this.jobOrder = this.jobOrder.filter((j) => j !== jobId)
  }
}

export const eventBus = new EventBus()
