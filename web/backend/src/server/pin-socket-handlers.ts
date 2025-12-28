/**
 * Pin socket handlers for LiveChat
 */
import type { Socket } from 'socket.io';
import { db } from '../database';
import { PinRepository } from '../database/pin-repository';

export function setupPinHandlers(socket: Socket, session: any) {
  const pinRepo = new PinRepository(db);
  const userId = session.user?.id;
  const username = session.user?.username;

  if (!userId || !username) return;

  // Pin a message
  socket.on('chat:pin:add', async (data: { roomId: string; messageId: number }) => {
    try {
      const { roomId, messageId } = data;

      // Check if already pinned
      const isPinned = await pinRepo.isPinned(roomId, messageId);
      if (isPinned) {
        socket.emit('chat:error', { error: 'Message already pinned' });
        return;
      }

      // Add pin
      await pinRepo.pinMessage(roomId, messageId, username);

      // Get updated pinned messages
      const pinnedMessages = await pinRepo.getPinnedMessages(roomId);

      // Broadcast to room
      socket.to(roomId).emit('chat:pin:updated', { roomId, pinnedMessages });
      socket.emit('chat:pin:updated', { roomId, pinnedMessages });
    } catch (error) {
      console.error('[Pin] Add error:', error);
      socket.emit('chat:error', { error: 'Failed to pin message' });
    }
  });

  // Unpin a message
  socket.on('chat:pin:remove', async (data: { roomId: string; messageId: number }) => {
    try {
      const { roomId, messageId } = data;

      await pinRepo.unpinMessage(roomId, messageId);

      // Get updated pinned messages
      const pinnedMessages = await pinRepo.getPinnedMessages(roomId);

      // Broadcast to room
      socket.to(roomId).emit('chat:pin:updated', { roomId, pinnedMessages });
      socket.emit('chat:pin:updated', { roomId, pinnedMessages });
    } catch (error) {
      console.error('[Pin] Remove error:', error);
      socket.emit('chat:error', { error: 'Failed to unpin message' });
    }
  });

  // Get pinned messages
  socket.on('chat:pin:list', async (data: { roomId: string }) => {
    try {
      const { roomId } = data;
      const pinnedMessages = await pinRepo.getPinnedMessages(roomId);
      socket.emit('chat:pin:list', { roomId, pinnedMessages });
    } catch (error) {
      console.error('[Pin] List error:', error);
      socket.emit('chat:error', { error: 'Failed to load pinned messages' });
    }
  });
}
