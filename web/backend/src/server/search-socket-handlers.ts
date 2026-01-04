/**
 * Search socket handlers for LiveChat
 */
import type { Socket } from 'socket.io';
import { db } from '../database';
import { SearchRepository, type SearchFilters } from '../database/search-repository';

export function setupSearchHandlers(socket: Socket, session: any) {
  const searchRepo = new SearchRepository(db);
  const userId = session.user?.id;

  if (!userId) return;

  // Search messages
  socket.on('chat:search', async (data: SearchFilters) => {
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
