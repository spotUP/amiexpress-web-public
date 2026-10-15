import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { readAdminToken } from '../api/auth-token';

/**
 * Global paging beep listener — works from ANY page, not just the operator
 * chat page. Connects to Socket.IO and plays a short sine beep on each
 * paging dot so the sysop never misses a page.
 */
export function PagingBeep() {
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const token = readAdminToken();
    if (!token) return;

    const socketUrl =
      import.meta.env.VITE_SOCKET_URL ||
      (typeof window !== 'undefined' ? window.location.origin : undefined);

    const socket = io(socketUrl || 'http://localhost:3001', {
      transports: ['websocket'],
      reconnection: true,
      auth: { token },
      query: { adminOnly: 'true' },
    });

    socket.on('connect', () => {
      socket.emit('operator:get-pending-pages');
    });

    socket.on('operator:paging-dot', () => {
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const ctx = audioCtxRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        osc.type = 'sine';
        gain.gain.value = 0.15;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.stop(ctx.currentTime + 0.08);
      } catch { /* audio not available */ }
    });

    return () => { socket.disconnect(); };
  }, []);

  return null;
}