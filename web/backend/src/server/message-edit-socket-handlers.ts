/**
 * Edit and delete handlers for LiveChat: chat:edit, chat:delete.
 *
 * An author edits or deletes their OWN message at any time (D5); a room
 * operator (db.isRoomOperator: the creator or a chat_room_ops row) or the
 * sysop deletes anyone's (D6). Only the author edits. The change is stored
 * (edited flag / deleted flag) and broadcast to the room as `chat:edited` /
 * `chat:deleted`; history carries the edited flag and omits deleted rows.
 * Exported like the reaction handlers: createDoorSocketWrapper routes the
 * door's emits here, setupMessageEditHandlers serves plain web clients.
 */
import type { Socket } from 'socket.io';
import type { BBSSession } from '../index';
import { onCaller, SYSOP_LEVEL } from './socket-guard';
import { db } from '../database';
import { emitToRoom } from '../handlers/chat/group-chat.handler';
import { liveMessageInRoom, parseMessageId, type StoredRoomMessage } from '../handlers/chat/message-in-room';

export interface EditData {
  messageId: string | number;
  content: string;
}

export interface DeleteData {
  messageId: string | number;
}

const MAX_MESSAGE_LENGTH = 500; // same cap as room:message

type StoredMessage = StoredRoomMessage;

/** The message, when it is live and in the room the caller stands in. */
async function messageInCallersRoom(socket: Socket, session: BBSSession, raw: unknown): Promise<{ id: number; message: StoredMessage } | undefined> {
  const id = parseMessageId(raw);
  if (id === undefined || !session.user?.username) {
    socket.emit('chat:error', { error: 'Invalid message' });
    return undefined;
  }
  const message = await liveMessageInRoom(db, id, session.currentRoomId);
  if (!message) {
    socket.emit('chat:error', { error: 'Message not found in this room' });
    return undefined;
  }
  return { id, message };
}

function isAuthor(session: BBSSession, message: StoredMessage): boolean {
  return String(message.sender_id) === String(session.user?.id);
}

export async function handleEdit(socket: Socket, session: BBSSession, data: EditData): Promise<void> {
  try {
    const content = typeof data?.content === 'string' ? data.content.trim() : '';
    if (!content || content.length > MAX_MESSAGE_LENGTH) {
      socket.emit('chat:error', { error: 'Invalid message text' });
      return;
    }
    const found = await messageInCallersRoom(socket, session, data?.messageId);
    if (!found) return;
    if (!isAuthor(session, found.message)) {
      socket.emit('chat:error', { error: 'You can only edit your own messages' });
      return;
    }
    if (!(await db.editRoomMessage(found.id, content))) return;
    emitToRoom(String(found.message.room_id), 'chat:edited', {
      messageId: String(found.id),
      roomId: String(found.message.room_id),
      username: found.message.sender_username,
      content,
      edited: true,
      createdAt: found.message.created_at,
    });
  } catch (error) {
    console.error('[MessageEdit] edit error:', error);
    socket.emit('chat:error', { error: 'Failed to edit message' });
  }
}

export async function handleDelete(socket: Socket, session: BBSSession, data: DeleteData): Promise<void> {
  try {
    const found = await messageInCallersRoom(socket, session, data?.messageId);
    if (!found) return;
    const sysop = Number((session.user as { secLevel?: unknown } | undefined)?.secLevel ?? 0) >= SYSOP_LEVEL;
    const allowed =
      isAuthor(session, found.message) ||
      sysop ||
      (await db.isRoomOperator(String(found.message.room_id), String(session.user?.id)));
    if (!allowed) {
      socket.emit('chat:error', { error: 'Only the author, a room operator or the sysop can delete this message' });
      return;
    }
    if (!(await db.deleteRoomMessage(found.id))) return;
    emitToRoom(String(found.message.room_id), 'chat:deleted', {
      messageId: String(found.id),
      roomId: String(found.message.room_id),
      by: session.user?.username,
    });
  } catch (error) {
    console.error('[MessageEdit] delete error:', error);
    socket.emit('chat:error', { error: 'Failed to delete message' });
  }
}

export function setupMessageEditHandlers(socket: Socket, _session: unknown): void {
  onCaller(socket, 'chat:edit', (caller, data: EditData) => handleEdit(socket, caller, data));
  onCaller(socket, 'chat:delete', (caller, data: DeleteData) => handleDelete(socket, caller, data));
}
