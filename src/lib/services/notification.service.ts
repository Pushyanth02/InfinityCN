/**
 * Lemniscate — Notification Service
 * ----------------------------------------------------------------------------
 * Centralized notification system that fans out events via multiple channels.
 * Today: EventBus (in-process WebSocket via Socket.IO).
 * Future: email, webhooks, push notifications (pluggable).
 */

import { eventBus } from '@/lib/events/bus'
import { createLogger } from '@/lib/logger'
import type { ProgressEvent } from '@/lib/types'

const logger = createLogger('notification-service')

// ─── Types ────────────────────────────────────────────────────────────────

export interface Notification {
  type: 'job_started' | 'job_progress' | 'job_completed' | 'job_failed' | 'job_cancelled'
  jobId: string
  documentId?: string
  message: string
  data?: Record<string, unknown>
  timestamp: number
}

// ─── Service methods ──────────────────────────────────────────────────────

/**
 * Broadcast a job lifecycle notification.
 */
export function notifyJobStarted(jobId: string, documentId: string, mode: string): void {
  const notification: Notification = {
    type: 'job_started',
    jobId,
    documentId,
    message: `Processing started (${mode})`,
    data: { mode },
    timestamp: Date.now(),
  }
  broadcast(notification)
}

export function notifyJobProgress(jobId: string, progress: number, stage: string): void {
  const notification: Notification = {
    type: 'job_progress',
    jobId,
    message: `Stage: ${stage} (${progress}%)`,
    data: { progress, stage },
    timestamp: Date.now(),
  }
  broadcast(notification)
}

export function notifyJobCompleted(
  jobId: string,
  documentId: string,
  result: { narrativeIds: string[]; sceneCount: number; characterCount: number; durationMs: number },
): void {
  const notification: Notification = {
    type: 'job_completed',
    jobId,
    documentId,
    message: `Processing completed in ${result.durationMs}ms`,
    data: result,
    timestamp: Date.now(),
  }
  broadcast(notification)
}

export function notifyJobFailed(jobId: string, error: string): void {
  const notification: Notification = {
    type: 'job_failed',
    jobId,
    message: error,
    data: { error },
    timestamp: Date.now(),
  }
  broadcast(notification)
}

export function notifyJobCancelled(jobId: string): void {
  const notification: Notification = {
    type: 'job_cancelled',
    jobId,
    message: 'Job cancelled by user',
    timestamp: Date.now(),
  }
  broadcast(notification)
}

// ─── Broadcast ────────────────────────────────────────────────────────────

/**
 * Broadcast a notification via all configured channels.
 */
function broadcast(notification: Notification): void {
  // Channel 1: EventBus → Socket.IO → Browser
  const event: ProgressEvent = {
    type: notification.type === 'job_completed' ? 'complete'
      : notification.type === 'job_failed' ? 'error'
      : notification.type === 'job_progress' ? 'progress'
      : 'stage',
    jobId: notification.jobId,
    stage: ((notification.data?.stage as string) || notification.type) as ProgressEvent['stage'],
    progress: notification.data?.progress as number | undefined,
    message: notification.message,
    timestamp: notification.timestamp,
  }
  eventBus.publish(event)

  logger.debug('Notification sent', {
    type: notification.type,
    jobId: notification.jobId,
  })

  // Future channels:
  // - webhookService.send(notification)
  // - emailService.send(notification)
  // - pushNotificationService.send(notification)
}
