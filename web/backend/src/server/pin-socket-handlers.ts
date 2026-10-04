/**
 * Pin socket handlers for LiveChat
 */
import type { Socket } from 'socket.io';
import type { BBSSession } from '../index';
import { onLevel, SYSOP_LEVEL } from './socket-guard';
import { db } from '../database';
import { PinRepository } from '../database/pin-repository';

export function setupPinHandlers(socket: Socket, session: any) {
  const pinRepo = new PinRepository(db);
  const userId = session.user?.id;
  const username = session.user?.username;

  if (!userId || !username) return;

  // Pinning writes into any room by id, and listing reads any room's pins,
  // private rooms included. No client sends these today (the livechat
  // door's emits go to the browser), so they are the sysop's until one does
  // and asks for a room-membership rule (open-surface audit, 2026-10-04).

  // Pin a message
  onLevel(socket, 'chat:pin:add', SYSOP_LEVEL, async (_caller: BBSSession, data: { roomId: string; messageId: number }) => {
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
  onLevel(socket, 'chat:pin:remove', SYSOP_LEVEL, async (_caller: BBSSession, data: { roomId: string; messageId: number }) => {
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
  onLevel(socket, 'chat:pin:list', SYSOP_LEVEL, async (_caller: BBSSession, data: { roomId: string }) => {
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
