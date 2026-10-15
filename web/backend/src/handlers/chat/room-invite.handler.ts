/**
 * /invite and /uninvite handler.
 * Moderator (or room owner) only. Adds/removes a row in chat_room_invites
 * and pings the invitee across all their connected sockets.
 */
import type { Socket, Server as IOServer } from 'socket.io';
import type { BBSSession } from '../../index';
import { db } from '../../database';

export interface InviteContext {
  io: IOServer;
  socket: Socket;
  session: BBSSession;
  data: { roomName?: string; roomId?: string; targetUsername: string };
  revoke?: boolean;
}

export async function handleRoomInvite(ctx: InviteContext): Promise<void> {
  const { io, socket, session, data, revoke } = ctx;
  try {
    if (!session.user?.id) {
      socket.emit('room:error', { error: 'Not logged in' });
      return;
    }
    const room = data.roomId
      ? await db.getChatRoom(data.roomId)
      : (data.roomName ? await db.getChatRoomByName(data.roomName) : null);
    if (!room) {
      socket.emit('room:error', { error: 'Room not found' });
      return;
    }

    const isMod = await db.isUserModerator(room.room_id, String(session.user.id));
    const isOwner = room.created_by === session.user.id;
    if (!isMod && !isOwner) {
      socket.emit('room:error', { error: 'Only moderators can invite' });
      return;
    }

    const targetUser = await db.getUserByUsername(data.targetUsername);
    if (!targetUser) {
      socket.emit('room:error', { error: `User ${data.targetUsername} not found` });
      return;
    }

    if (revoke) {
      await db.revokeInvite(room.room_id, String(targetUser.id));
      socket.emit('room:invite-revoked', { roomId: room.room_id, username: data.targetUsername });
      return;
    }

    await db.inviteUser(room.room_id, String(targetUser.id), String(session.user.id));
    socket.emit('room:invited', { roomId: room.room_id, username: data.targetUsername });

    // Multi-tab fanout: ping every invitee socket via the user:<id> room.
    // socket.io silently drops if the user has no connected sockets — no need
    // to gate on getSocketIdByUserId here.
    io.to('user:' + String(targetUser.id)).emit('room:invite-received', {
      roomId: room.room_id,
      roomName: room.room_name,
      from: session.user.username,
    });
  } catch (error) {
    console.error('[room-invite.handler] handleRoomInvite error:', error);
    socket.emit('room:error', { error: 'Failed to process invite' });
  }
}
