/**
 * The chat room calls a door makes through BBSApi (the LiveChat door).
 *
 * A door runs on the server, so it calls the group chat handlers directly
 * rather than emitting to itself. Those handlers answer on the socket; the
 * join and create calls need that answer back as a return value, which is what
 * `captureEmittedEvent` is for. `setGroupChatDependencies` is called at server
 * startup in index.ts.
 *
 * The handlers and the database are required at call time, as BBSApi always
 * did, so loading a door's API does not load the chat stack.
 */
import type { Socket } from 'socket.io';

import type { BBSSession } from '../index';

export interface JoinedRoom {
  success: boolean;
  roomId?: string;
  roomName?: string;
  memberCount?: number;
  members?: any[];
  error?: string;
}

export interface CreatedRoom {
  success: boolean;
  roomId?: string;
  error?: string;
}

export interface NewRoomOptions {
  topic?: string;
  isPublic?: boolean;
  password?: string;
  maxUsers?: number;
}

/**
 * Run `call` and hand back the payload of the `event` it emits, if any. The
 * event still reaches the client.
 *
 * Restores what was FOUND, not a bound copy of it: on a socket.io Socket `emit`
 * lives on the PROTOTYPE, so assigning a bound copy back would pin a permanent
 * own property onto the instance. Same rule as `c64-door-adapter.ts:333-344`.
 */
async function captureEmittedEvent(socket: Socket, event: string, call: () => Promise<void>): Promise<any> {
  let captured: any = null;
  const hadOwnEmit = Object.prototype.hasOwnProperty.call(socket, 'emit');
  const found = socket.emit;
  const downstream = found.bind(socket);

  const interceptor = ((emitted: string, ...args: any[]) => {
    if (emitted === event) {
      captured = args[0];
    }
    return downstream(emitted, ...args);
  }) as any;
  socket.emit = interceptor;

  try {
    await call();
  } finally {
    // In a `finally` so a throwing handler cannot leak the interceptor, and
    // only while ours is still the live one, so a wrapper installed during
    // the handler is not torn off.
    if (socket.emit === interceptor) {
      if (hadOwnEmit) socket.emit = found;
      else delete (socket as any).emit;
    }
  }
  return captured;
}

export async function joinChatRoom(socket: Socket, session: BBSSession, roomName: string, password?: string): Promise<JoinedRoom> {
  try {
    const { handleRoomJoin } = require('../handlers/chat/group-chat.handler');
    const response = await captureEmittedEvent(socket, 'room:joined', () =>
      handleRoomJoin(socket, session, { roomName, password }));

    if (response) {
      return {
        success: true,
        roomId: response.roomId,
        roomName: response.roomName,
        memberCount: response.memberCount,
        members: response.members
      };
    }

    return { success: false, error: 'Failed to join room' };
  } catch (error) {
    console.error('[BBSApi] Error joining room:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function leaveChatRoom(socket: Socket, session: BBSSession): Promise<boolean> {
  try {
    const { handleRoomLeave } = require('../handlers/chat/group-chat.handler');
    await handleRoomLeave(socket, session);
    return true;
  } catch (error) {
    console.error('[BBSApi] Error leaving room:', error);
    return false;
  }
}

export async function sendChatRoomMessage(socket: Socket, session: BBSSession, message: string): Promise<boolean> {
  try {
    const { handleRoomMessage } = require('../handlers/chat/group-chat.handler');
    await handleRoomMessage(socket, session, { message });
    return true;
  } catch (error) {
    console.error('[BBSApi] Error sending room message:', error);
    return false;
  }
}

export async function createChatRoom(socket: Socket, session: BBSSession, roomName: string, options?: NewRoomOptions): Promise<CreatedRoom> {
  try {
    const { handleRoomCreate } = require('../handlers/chat/group-chat.handler');
    const response = await captureEmittedEvent(socket, 'room:created', () =>
      handleRoomCreate(socket, session, {
        roomName,
        topic: options?.topic,
        isPublic: options?.isPublic,
        password: options?.password,
        maxUsers: options?.maxUsers
      }));

    if (response) {
      return { success: true, roomId: response.roomId };
    }

    return { success: false, error: 'Failed to create room' };
  } catch (error) {
    console.error('[BBSApi] Error creating room:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function listChatRooms(showPrivate?: boolean): Promise<any[]> {
  try {
    const { db } = require('../database');
    const rooms = await db.listChatRooms(!showPrivate);
    return rooms || [];
  } catch (error) {
    console.error('[BBSApi] Error listing rooms:', error);
    return [];
  }
}
