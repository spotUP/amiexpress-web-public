/**
 * Search socket event handlers for LiveChat frontend
 */
import type { Socket } from 'socket.io-client';

export function setupSearchListeners(
  socket: Socket,
  onResults: (data: any) => void
) {
  socket.on('chat:search:results', onResults);
}

export function searchMessages(socket: Socket, query: string, filters?: {
  roomId?: string;
  username?: string;
  startDate?: number;
  endDate?: number;
  limit?: number;
}) {
  socket.emit('chat:search', { query, ...filters });
}

export function cleanupSearchListeners(socket: Socket) {
  socket.off('chat:search:results');
}
