/**
 * Reaction handlers for LiveChat: chat:react, chat:unreact, chat:reactions:list.
 *
 * Reactions are stored with the message (chat_message_reactions) and
 * broadcast to the room as `chat:reaction`. The functions are exported
 * because the livechat door's emits never reach a socket.on listener (they go
 * to the browser); createDoorSocketWrapper (handlers/door.handler.ts) routes
 * them here, like room:message. setupReactionHandlers serves plain web clients.
 */
import type { Socket } from 'socket.io';
import type { BBSSession } from '../index';
import { onCaller } from './socket-guard';
import { db } from '../database';
import { emitToRoom } from '../handlers/chat/group-chat.handler';

export interface ReactionData {
  messageId: string | number;
  emoji: string;
}

const MAX_EMOJI_LENGTH = 32;

/** The door sends ids as strings; the DB row id is a number. */
function parseMessageId(raw: unknown): number | undefined {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

async function change(socket: Socket, session: BBSSession, data: ReactionData, add: boolean): Promise<void> {
  try {
    const username = session.user?.username;
    const messageId = parseMessageId(data?.messageId);
    const emoji = typeof data?.emoji === 'string' ? data.emoji.trim() : '';
    if (!username || messageId === undefined || !emoji || emoji.length > MAX_EMOJI_LENGTH) {
      socket.emit('chat:error', { error: 'Invalid reaction' });
      return;
    }
    const message = await db.getMessageById(messageId);
    if (!message || String(message.room_id) !== String(session.currentRoomId)) {
      socket.emit('chat:error', { error: 'Message not found in this room' });
      return;
    }
    const changed = add
      ? await db.addReaction(messageId, username, emoji)
      : await db.removeReaction(messageId, username, emoji);
    if (!changed) return; // duplicate react, or nothing to remove
    const counts = await db.getReactionCounts(messageId);
    emitToRoom(String(message.room_id), 'chat:reaction', {
      messageId: String(messageId),
      username,
      emoji,
      action: add ? 'add' : 'remove',
      counts,
    });
  } catch (error) {
    console.error('[Reaction] error:', error);
    socket.emit('chat:error', { error: 'Failed to update reaction' });
  }
}

export function handleReact(socket: Socket, session: BBSSession, data: ReactionData): Promise<void> {
  return change(socket, session, data, true);
}

export function handleUnreact(socket: Socket, session: BBSSession, data: ReactionData): Promise<void> {
  return change(socket, session, data, false);
}

export async function handleReactionsList(socket: Socket, session: BBSSession, data: { messageId: string | number }): Promise<void> {
  try {
    const messageId = parseMessageId(data?.messageId);
    if (messageId === undefined) return;
    const message = await db.getMessageById(messageId);
    if (!message || String(message.room_id) !== String(session.currentRoomId)) return;
    const counts = await db.getReactionCounts(messageId);
    socket.emit('chat:reactions:list', { messageId: String(messageId), counts });
  } catch (error) {
    console.error('[Reaction] list error:', error);
    socket.emit('chat:error', { error: 'Failed to load reactions' });
  }
}

export function setupReactionHandlers(socket: Socket, _session: any) {
  onCaller(socket, 'chat:react', (caller, data: ReactionData) => handleReact(socket, caller, data));
  onCaller(socket, 'chat:unreact', (caller, data: ReactionData) => handleUnreact(socket, caller, data));
  onCaller(socket, 'chat:reactions:list', (caller, data: { messageId: string | number }) => handleReactionsList(socket, caller, data));
}
