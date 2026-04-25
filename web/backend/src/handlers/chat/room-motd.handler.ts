/**
 * Set the channel MOTD (Message of the Day).
 * Moderator only. Broadcasts room:motd to the room on success.
 */
import type { Socket, Server as IOServer } from 'socket.io';
import type { BBSSession } from '../../index';
import { db } from '../../database';

export interface SetMotdContext {
  io: IOServer;
  socket: Socket;
  session: BBSSession;
  data: { motd: string | null };
}

export async function handleSetRoomMotd(ctx: SetMotdContext): Promise<void> {
  const { io, socket, session, data } = ctx;
  try {
    if (!session.user?.id || !session.currentRoomId) {
      socket.emit('room:error', { error: 'Not in a room' });
      return;
    }
    const isMod = await db.isUserModerator(session.currentRoomId, String(session.user.id));
    const room = await db.getChatRoom(session.currentRoomId);
    const isOwner = room?.created_by === session.user.id;
    if (!isMod && !isOwner) {
      socket.emit('room:error', { error: 'Only moderators can set the MOTD' });
      return;
    }
    const motd = typeof data.motd === 'string' ? data.motd.slice(0, 500) : null;
    await db.setMotd(session.currentRoomId, motd);
    io.to('room:' + session.currentRoomId).emit('room:motd', {
      roomId: session.currentRoomId,
      motd,
    });
  } catch (error) {
    console.error('[room-motd.handler] handleSetRoomMotd error:', error);
    socket.emit('room:error', { error: 'Failed to set MOTD' });
  }
}
