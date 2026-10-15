/**
 * Search socket handlers for LiveChat
 */
import type { Socket } from 'socket.io';
import type { BBSSession } from '../index';
import { onLevel, SYSOP_LEVEL } from './socket-guard';
import { db } from '../database';
import { SearchRepository, type SearchFilters } from '../database/search-repository';

export function setupSearchHandlers(socket: Socket, session: any) {
  const searchRepo = new SearchRepository(db);
  const userId = session.user?.id;

  if (!userId) return;

  // Search reads every room's messages, private rooms included. No client
  // sends this today (the livechat door's emit goes to the browser), so it
  // is the sysop's until one does and asks for a room-membership rule
  // (open-surface audit, 2026-10-04).

  // Search messages
  onLevel(socket, 'chat:search', SYSOP_LEVEL, async (_caller: BBSSession, data: SearchFilters) => {
    try {
      const { query, roomId, username, startDate, endDate, limit } = data;

      // Validate query
      if (!query || query.trim().length < 2) {
        socket.emit('chat:error', { error: 'Search query must be at least 2 characters' });
        return;
      }

      // Perform search
      const results = await searchRepo.searchMessages({
        query: query.trim(),
        roomId,
        username,
        startDate,
        endDate,
        limit
      });

      socket.emit('chat:search:results', {
        query,
        results,
        count: results.length
      });
    } catch (error) {
console.error('[Search] Error:', error);
      socket.emit('chat:error', { error: 'Search failed' });
    }
  });
}
