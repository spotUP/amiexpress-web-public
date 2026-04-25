/**
 * Direct Message handler
 * - 1:1: resolves recipient by username, persists to chat_dm_messages, emits chat:dm to both sides.
 * - Group: takes list of usernames, resolves all, creates a group thread.
 *
 * Modern enhancement beyond original AmiExpress BBS (no express.e counterpart).
 */
import type { Socket, Server as IOServer } from 'socket.io';
import type { BBSSession } from '../../index';
import { db } from '../../database';
import { getSystemTime } from '../../utils/date-time.util';

/**
 * Sanitize message (strip ANSI escape sequences for security).
 * Mirrors the inline sanitizer used by group-chat.handler.ts.
 */
function sanitizeMessage(message: string): string {
  return message.replace(/\x1b/g, '');
}

export interface RecipientInfo { userId: string; socketId: string | null; }
export type RecipientResolver = (username: string) => Promise<RecipientInfo | null> | RecipientInfo | null;

export interface DmContext {
  io: IOServer;
  socket: Socket;
  session: BBSSession;
  data: { to: string; message: string };
  resolveRecipient: RecipientResolver;
}

export async function handleChatDm(ctx: DmContext): Promise<void> {
  const { io, socket, session, data, resolveRecipient } = ctx;
  try {
    if (!session.user?.id || !session.user?.username) {
      socket.emit('chat:dm-error', { error: 'Not logged in' });
      return;
    }
    if (!data?.to || !data?.message?.trim()) {
      socket.emit('chat:dm-error', { error: 'Usage: /msg @user message' });
      return;
    }
    const recipient = await resolveRecipient(data.to);
    if (!recipient) {
      socket.emit('chat:dm-error', { error: `User ${data.to} not found` });
      return;
    }

    const message = sanitizeMessage(data.message.trim()).slice(0, 500);
    const senderId = String(session.user.id);
    const senderName = session.user.username;
    const threadId = await db.getOrCreateDmThread([senderId, recipient.userId]);
    const msgId = await db.saveDmMessage(threadId, senderId, senderName, message);
    const payload = {
      threadId,
      messageId: msgId,
      from: senderName,
      fromId: senderId,
      to: data.to,
      message,
      timestamp: getSystemTime().getTime(),
      isGroup: false,
      delivered: !!recipient.socketId,
    };

    socket.emit('chat:dm', { ...payload, direction: 'sent' });
    // Multi-tab fanout: deliver to every recipient socket via the user:<id> room.
    if (recipient.userId) {
      io.to('user:' + recipient.userId).emit('chat:dm', { ...payload, direction: 'received' });
    }
  } catch (error) {
    console.error('[dm.handler] handleChatDm error:', error);
    socket.emit('chat:dm-error', { error: 'Failed to send DM' });
  }
}

export interface GroupDmContext {
  io: IOServer;
  socket: Socket;
  session: BBSSession;
  data: { participants: string[]; message: string };
  resolveRecipient: RecipientResolver;
}

export async function handleChatGroupDm(ctx: GroupDmContext): Promise<void> {
  const { io, socket, session, data, resolveRecipient } = ctx;
  try {
    if (!session.user?.id || !session.user?.username) {
      socket.emit('chat:dm-error', { error: 'Not logged in' });
      return;
    }
    if (!Array.isArray(data.participants) || data.participants.length < 2) {
      socket.emit('chat:dm-error', { error: 'Group DM requires 2+ other participants' });
      return;
    }
    if (!data.message?.trim()) {
      socket.emit('chat:dm-error', { error: 'Message required' });
      return;
    }

    const senderId = String(session.user.id);
    const senderName = session.user.username;
    const resolved: RecipientInfo[] = [];
    for (const uname of data.participants) {
      const r = await resolveRecipient(uname);
      if (!r) { socket.emit('chat:dm-error', { error: `User ${uname} not found` }); return; }
      resolved.push(r);
    }
    const userIds = [senderId, ...resolved.map(r => r.userId)];
    const unique = Array.from(new Set(userIds));
    if (unique.length < 3) {
      socket.emit('chat:dm-error', { error: 'Group DM needs 3+ unique participants (use /msg for 1:1)' });
      return;
    }
    const message = sanitizeMessage(data.message.trim()).slice(0, 500);
    const threadId = await db.getOrCreateDmThread(unique);
    const msgId = await db.saveDmMessage(threadId, senderId, senderName, message);

    const payload = {
      threadId,
      messageId: msgId,
      from: senderName,
      fromId: senderId,
      participants: data.participants,
      message,
      timestamp: getSystemTime().getTime(),
      isGroup: true,
      delivered: resolved.some(r => r.socketId !== null),
    };
    socket.emit('chat:dm', { ...payload, direction: 'sent' });
    // Multi-tab fanout: deliver to every recipient socket via user:<id> rooms.
    for (const r of resolved) {
      if (r.userId) io.to('user:' + r.userId).emit('chat:dm', { ...payload, direction: 'received' });
    }
  } catch (error) {
    console.error('[dm.handler] handleChatGroupDm error:', error);
    socket.emit('chat:dm-error', { error: 'Failed to send DM' });
  }
}

export async function handleChatDmHistory(
  socket: Socket,
  session: BBSSession,
  data: { threadId: string; limit?: number },
): Promise<void> {
  try {
    if (!session.user?.id) return;
    const participants = await db.getDmParticipants(data.threadId);
    if (!participants.some((p: any) => String(p.user_id) === String(session.user!.id))) {
      socket.emit('chat:dm-error', { error: 'Not a participant of this thread' });
      return;
    }
    const history = await db.getDmHistory(data.threadId, data.limit || 50);
    socket.emit('chat:dm-history', { threadId: data.threadId, messages: history });
  } catch (error) {
    console.error('[dm.handler] handleChatDmHistory error:', error);
    socket.emit('chat:dm-error', { error: 'Failed to send DM' });
  }
}
