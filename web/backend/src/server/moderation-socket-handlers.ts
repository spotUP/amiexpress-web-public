/**
 * Moderation socket handlers for LiveChat
 */
import type { Socket } from 'socket.io';
import type { BBSSession } from '../index';
import { onLevel, SYSOP_LEVEL } from './socket-guard';
import { db } from '../database';
import { ModerationRepository } from '../database/moderation-repository';

export function setupModerationHandlers(socket: Socket, session: any, io: any) {
  const modRepo = new ModerationRepository(db);
  const userId = session.user?.id;
  const username = session.user?.username;

  if (!userId || !username) return;

  // The sysop's tools: kick, ban and mute any caller, and a system line into
  // any room. Open to every logged-on chat user before (open-surface audit,
  // 2026-10-04); no client sends these today - the livechat door's own
  // emits of these names go to the browser, not here.

  // Kick user (temporary disconnection)
  onLevel(socket, 'chat:kick', SYSOP_LEVEL, async (_caller: BBSSession, data: { roomId: string; targetUserId: string; reason?: string }) => {
    try {
      const { roomId, targetUserId, reason } = data;

      // Find target socket and force disconnect
      const targetSocket = Array.from(io.sockets.sockets.values()).find(
        (s: any) => s.data.session?.user?.id === targetUserId
      ) as Socket | undefined;

      if (targetSocket) {
        targetSocket.emit('chat:kicked', { reason, kickedBy: username });
        targetSocket.disconnect(true);
      }

      // Broadcast to room
      socket.to(roomId).emit('chat:message', {
        type: 'system',
        message: `User was kicked by ${username}${reason ? ': ' + reason : ''}`
      });

      socket.emit('chat:message', {
        type: 'system',
        message: `User kicked successfully`
      });
    } catch (error) {
console.error('[Moderation] Kick error:', error);
      socket.emit('chat:error', { error: 'Failed to kick user' });
    }
  });

  // Ban user
  onLevel(socket, 'chat:ban', SYSOP_LEVEL, async (_caller: BBSSession, data: { roomId: string; targetUserId: string; reason?: string; duration?: number }) => {
    try {
      const { roomId, targetUserId, reason, duration } = data;

      const expiresAt = duration ? Math.floor(Date.now() / 1000) + duration : undefined;
      await modRepo.banUser(roomId, targetUserId, username, reason, expiresAt);

      // Kick if currently in room
      const targetSocket = Array.from(io.sockets.sockets.values()).find(
        (s: any) => s.data.session?.user?.id === targetUserId
      ) as Socket | undefined;

      if (targetSocket) {
        targetSocket.emit('chat:banned', { reason, bannedBy: username, duration });
        targetSocket.disconnect(true);
      }

      // Broadcast to room
      socket.to(roomId).emit('chat:message', {
        type: 'system',
        message: `User was banned by ${username}${duration ? ' for ' + duration + 's' : ''}${reason ? ': ' + reason : ''}`
      });

      socket.emit('chat:message', {
        type: 'system',
        message: `User banned successfully`
      });
    } catch (error) {
console.error('[Moderation] Ban error:', error);
      socket.emit('chat:error', { error: 'Failed to ban user' });
    }
  });

  // Unban user
  onLevel(socket, 'chat:unban', SYSOP_LEVEL, async (_caller: BBSSession, data: { roomId: string; targetUserId: string }) => {
    try {
      const { roomId, targetUserId } = data;
      await modRepo.unbanUser(roomId, targetUserId);

      socket.emit('chat:message', {
        type: 'system',
        message: `User unbanned successfully`
      });
    } catch (error) {
console.error('[Moderation] Unban error:', error);
      socket.emit('chat:error', { error: 'Failed to unban user' });
    }
  });

  // Mute user
  onLevel(socket, 'chat:mute', SYSOP_LEVEL, async (_caller: BBSSession, data: { roomId: string; targetUserId: string; duration?: number }) => {
    try {
      const { roomId, targetUserId, duration } = data;
      await modRepo.muteUser(roomId, targetUserId, username, duration);

      // Notify target user if online
      const targetSocket = Array.from(io.sockets.sockets.values()).find(
        (s: any) => s.data.session?.user?.id === targetUserId
      ) as Socket | undefined;

      if (targetSocket) {
        targetSocket.emit('chat:muted', { mutedBy: username, duration });
      }

      socket.emit('chat:message', {
        type: 'system',
        message: `User muted${duration ? ' for ' + duration + 's' : ''}`
      });
    } catch (error) {
console.error('[Moderation] Mute error:', error);
      socket.emit('chat:error', { error: 'Failed to mute user' });
    }
  });

  // Unmute user
  onLevel(socket, 'chat:unmute', SYSOP_LEVEL, async (_caller: BBSSession, data: { roomId: string; targetUserId: string }) => {
    try {
      const { roomId, targetUserId } = data;
      await modRepo.unmuteUser(roomId, targetUserId);

      socket.emit('chat:message', {
        type: 'system',
        message: `User unmuted successfully`
      });
    } catch (error) {
console.error('[Moderation] Unmute error:', error);
      socket.emit('chat:error', { error: 'Failed to unmute user' });
    }
  });
}
