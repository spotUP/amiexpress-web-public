/**
 * Room topic, room operators and channel deletion for LiveChat
 * (decision D6): room:topic, room:op, admin:delete-channel.
 *
 * Only the SYSOP grants or revokes operator status (room:op). A room
 * operator (db.isRoomOperator: the creator or a chat_room_ops row) or the
 * sysop sets the topic and deletes the channel. A refusal replies chat:error
 * to the caller and stores and broadcasts nothing. Exported like the edit
 * handlers: createDoorSocketWrapper routes the door's emits here,
 * setupRoomOperatorHandlers serves plain web clients.
 */
import type { Socket } from 'socket.io';
import type { BBSSession } from '../index';
import { onCaller, SYSOP_LEVEL } from './socket-guard';
import { db } from '../database';
import { emitToRoom } from '../handlers/chat/group-chat.handler';

export interface TopicData { topic: string }
export interface OpData { username: string; op: boolean }
export interface DeleteChannelData { channel: string }

const MAX_TOPIC_LENGTH = 200;

function isSysop(session: BBSSession): boolean {
  return Number((session.user as { secLevel?: unknown } | undefined)?.secLevel ?? 0) >= SYSOP_LEVEL;
}

async function mayModerate(session: BBSSession, roomId: string): Promise<boolean> {
  return isSysop(session) || (await db.isRoomOperator(roomId, String(session.user?.id)));
}

export async function handleSetTopic(socket: Socket, session: BBSSession, data: TopicData): Promise<void> {
  try {
    const roomId = session.currentRoomId ? String(session.currentRoomId) : '';
    const topic = typeof data?.topic === 'string' ? data.topic.trim() : '';
    if (!roomId || !topic || topic.length > MAX_TOPIC_LENGTH) {
      socket.emit('chat:error', { error: 'Invalid topic' });
      return;
    }
    if (!(await mayModerate(session, roomId))) {
      socket.emit('chat:error', { error: 'Only a room operator or the sysop can set the topic' });
      return;
    }
    await db.updateChatRoom(roomId, { topic });
    emitToRoom(roomId, 'room:topic', { roomId, topic, by: session.user?.username });
  } catch (error) {
    console.error('[RoomOperator] topic error:', error);
    socket.emit('chat:error', { error: 'Failed to set topic' });
  }
}

export async function handleOp(socket: Socket, session: BBSSession, data: OpData): Promise<void> {
  try {
    if (!isSysop(session)) {
      socket.emit('chat:error', { error: 'Only the sysop can grant or revoke operator status' });
      return;
    }
    const roomId = session.currentRoomId ? String(session.currentRoomId) : '';
    const name = typeof data?.username === 'string' ? data.username.replace(/^@/, '').trim() : '';
    const target = name ? ((await db.getUserByUsername(name)) as { id?: string | number; username?: string } | undefined) : undefined;
    if (!roomId || !target || target.id == null) {
      socket.emit('chat:error', { error: 'No such user or room' });
      return;
    }
    const op = data.op !== false;
    if (op) await db.addRoomOperator(roomId, String(target.id));
    else await db.removeRoomOperator(roomId, String(target.id));
    emitToRoom(roomId, 'room:op-changed', { roomId, username: target.username ?? name, op, by: session.user?.username });
  } catch (error) {
    console.error('[RoomOperator] op error:', error);
    socket.emit('chat:error', { error: 'Failed to change operator status' });
  }
}

export async function handleDeleteChannel(socket: Socket, session: BBSSession, data: DeleteChannelData): Promise<void> {
  try {
    const name = typeof data?.channel === 'string' ? data.channel.replace(/^#/, '').trim() : '';
    const room = name ? ((await db.getChatRoomByName(name)) as { room_id?: string; room_name?: string } | undefined) : undefined;
    if (!room?.room_id) {
      socket.emit('chat:error', { error: 'No such channel' });
      return;
    }
    if (!(await mayModerate(session, String(room.room_id)))) {
      socket.emit('chat:error', { error: 'Only a room operator or the sysop can delete a channel' });
      return;
    }
    await db.deleteChatRoom(String(room.room_id));
    emitToRoom(String(room.room_id), 'room:deleted', { roomId: String(room.room_id), roomName: room.room_name, by: session.user?.username });
  } catch (error) {
    console.error('[RoomOperator] delete error:', error);
    socket.emit('chat:error', { error: 'Failed to delete channel' });
  }
}

export function setupRoomOperatorHandlers(socket: Socket, _session: unknown): void {
  onCaller(socket, 'room:topic', (caller, data: TopicData) => handleSetTopic(socket, caller, data));
  onCaller(socket, 'room:op', (caller, data: OpData) => handleOp(socket, caller, data));
  onCaller(socket, 'admin:delete-channel', (caller, data: DeleteChannelData) => handleDeleteChannel(socket, caller, data));
}
