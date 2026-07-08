'use client'

import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

/**
 * Tracks whether the realtime worker (port 3003) is reachable via Socket.IO.
 * Capped at 5 reconnection attempts to avoid infinite console noise when the
 * worker is offline (the common case in sandbox deployments). The app still
 * works via HTTP polling fallback when the worker is down.
 */
export function useWorkerStatus(): boolean {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const socket = io('/?XTransformPort=3003', {
      path: '/',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 3000,
      reconnectionAttempts: 5,
      timeout: 4000,
    })
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', () => setConnected(false))
    return () => {
      socket.disconnect()
    }
  }, [])

  return connected
}
