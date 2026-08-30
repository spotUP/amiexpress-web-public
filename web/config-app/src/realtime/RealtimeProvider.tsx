/**
 * One socket for the whole admin app.
 *
 * It handshakes with `adminOnly=true`, which the backend serves without
 * assigning a BBS node - see `server/admin-socket.ts`. Every page reads its
 * status from here rather than opening a socket of its own.
 *
 * What arrives on it invalidates queries rather than being written into a
 * store: TanStack Query already owns the data, so an event says "this is
 * stale" and the refetch is what puts the new value on screen. That keeps one
 * source of truth for every figure in the admin.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { createInvalidationScheduler } from './query-bridge';
import type { BBSEvent, ImportProgressEvent, RealtimeStatus } from '../types/realtime';

type EventListener = (event: BBSEvent) => void;

interface RealtimeContextValue {
  status: RealtimeStatus;
  /** When the last BBS event arrived, or null if none has. */
  lastEventAt: number | null;
  /** Subscribe to the live feed. Returns the unsubscribe function. */
  subscribe: (listener: EventListener) => () => void;
  socket: Socket | null;
}

const RealtimeContext = createContext<RealtimeContextValue | undefined>(undefined);

function socketOrigin(): string {
  const configured = import.meta.env.VITE_SOCKET_URL;
  if (configured) return configured;
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>('offline');
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const listenersRef = useRef(new Set<EventListener>());

  const subscribe = useCallback((listener: EventListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      // Not signed in: the pages keep polling, the header says so.
      setStatus('offline');
      return;
    }

    const scheduler = createInvalidationScheduler((keys) => {
      for (const key of keys) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    });

    const origin = socketOrigin();
    const socket = io(origin, {
      transports: ['websocket'],
      reconnection: true,
      secure: origin.startsWith('https'),
      auth: { token },
      query: { adminOnly: 'true' },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('live');
      // Everything may have moved while the socket was down.
      void queryClient.invalidateQueries({ queryKey: ['nodes'] });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
    });

    socket.on('disconnect', () => setStatus('reconnecting'));
    socket.io.on('reconnect_attempt', () => setStatus('reconnecting'));
    socket.on('connect_error', () => setStatus('offline'));

    socket.on('bbs:event', (event: BBSEvent) => {
      setLastEventAt(Date.now());
      scheduler.push(event);
      for (const listener of listenersRef.current) listener(event);
    });

    socket.on('import:progress', (progress: ImportProgressEvent) => {
      queryClient.setQueryData(['import', 'progress', progress.sessionId], progress);
    });

    return () => {
      scheduler.dispose();
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [queryClient]);

  const value = useMemo<RealtimeContextValue>(
    () => ({ status, lastEventAt, subscribe, socket: socketRef.current }),
    [status, lastEventAt, subscribe]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within RealtimeProvider');
  }
  return context;
}

/** Subscribe to the live BBS feed. The listener does not need to be stable. */
export function useBbsEvents(listener: EventListener) {
  const { subscribe } = useRealtime();
  const latest = useRef(listener);
  latest.current = listener;

  useEffect(() => subscribe((event) => latest.current(event)), [subscribe]);
}
