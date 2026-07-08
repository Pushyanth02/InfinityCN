'use client'

import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useLemniscate } from './store'

export interface ProgressPayload {
  type: 'progress' | 'stage' | 'log' | 'complete' | 'error'
  jobId: string
  documentId?: string
  stage?: string
  progress?: number
  message?: string
  level?: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'
  timestamp: number
  result?: {
    narrativeIds?: string[]
    sceneCount?: number
    characterCount?: number
    durationMs?: number
  }
}

export interface LogEntry {
  jobId: string
  stage: string
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'
  message: string
  timestamp: number
}

/**
 * Subscribe to realtime progress for one or many jobs.
 * Connects to the worker service via the gateway: io("/?XTransformPort=3003")
 */
export function useRealtime(jobIds: string[]) {
  const socketRef = useRef<Socket | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [connected, setConnected] = useState(false)
  const patchProgress = useLemniscate((s) => s.patchProgress)
  const jobIdsKey = jobIds.join(',')

  useEffect(() => {
    // Derive the id list from the stable key so the effect's only inputs are
    // `jobIdsKey` (changes when the set of jobs changes) and the stable Zustand
    // `patchProgress` action — this satisfies exhaustive-deps without a disable.
    const ids = jobIdsKey ? jobIdsKey.split(',').filter(Boolean) : []
    if (ids.length === 0) return
    const socket = io('/?XTransformPort=3003', {
      path: '/',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionAttempts: 10,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      // Clear stale logs from a previous job subscription on (re)connect.
      setLogs([])
      for (const jid of ids) socket.emit('subscribe', jid)
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', () => setConnected(false))

    const handler = (evt: ProgressPayload) => {
      if (!ids.includes(evt.jobId)) return
      if (evt.type === 'log' && evt.level && evt.message) {
        setLogs((prev) => [
          ...prev.slice(-200),
          {
            jobId: evt.jobId,
            stage: evt.stage ?? '',
            level: evt.level ?? 'INFO',
            message: evt.message ?? '',
            timestamp: evt.timestamp,
          },
        ])
      }
      if (evt.type === 'stage' || evt.type === 'progress') {
        patchProgress(evt.jobId, {
          progress: evt.progress,
          stage: evt.stage,
          message: evt.message,
          status: 'PROCESSING',
        })
      }
      if (evt.type === 'complete') {
        patchProgress(evt.jobId, {
          progress: 100,
          stage: 'COMPLETED',
          status: 'COMPLETED',
          message: 'Pipeline complete.',
        })
      }
      if (evt.type === 'error') {
        patchProgress(evt.jobId, {
          stage: 'FAILED',
          status: 'FAILED',
          message: evt.message,
        })
      }
    }
    socket.on('progress', handler)

    return () => {
      socket.off('progress', handler)
      socket.disconnect()
      socketRef.current = null
      setConnected(false)
    }
  }, [jobIdsKey, patchProgress])

  return { connected, logs }
}
