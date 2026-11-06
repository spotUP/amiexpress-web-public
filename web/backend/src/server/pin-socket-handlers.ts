/**
 * Pin socket handlers for LiveChat
 */
import type { Socket } from 'socket.io';
import type { BBSSession } from '../index';
import { onLevel, SYSOP_LEVEL } from './socket-guard';
import { db } from '../database';
import { PinRepository } from '../database/pin-repository';

const pinRepo = () => new PinRepository(db);

/** The door's ids are strings; the DB row id is a number. */
const rowId = (raw: unknown) => Number(raw);

export async function handlePinAdd(socket: Socket, session: BBSSession, data: { roomId: string; messageId: number | string }) {
  const username = session.user?.username;
  if (!username) return;
  try {
    const { roomId } = data;
    const messageId = rowId(data.messageId);
    const repo = pinRepo();
    if (await repo.isPinned(roomId, messageId)) {
      socket.emit('chat:error', { error: 'Message already pinned' });
      return;
    }
    await repo.pinMessage(roomId, messageId, username);
    const pinnedMessages = await repo.getPinnedMessages(roomId);
    emitPinsUpdated(socket, roomId, pinnedMessages);
  } catch (error) {
    console.error('[Pin] Add error:', error);
    socket.emit('chat:error', { error: 'Failed to pin message' });
  }
}

export async function handlePinRemove(socket: Socket, _session: BBSSession, data: { roomId: string; messageId: number | string }) {
  try {
    const { roomId } = data;
    const repo = pinRepo();
    await repo.unpinMessage(roomId, rowId(data.messageId));
    emitPinsUpdated(socket, roomId, await repo.getPinnedMessages(roomId));
  } catch (error) {
    console.error('[Pin] Remove error:', error);
    socket.emit('chat:error', { error: 'Failed to unpin message' });
  }
}

export async function handlePinList(socket: Socket, _session: BBSSession, data: { roomId: string }) {
  try {
    const { roomId } = data;
    const pinnedMessages = await pinRepo().getPinnedMessages(roomId);
    socket.emit('chat:pin:list', { roomId, pinnedMessages });
  } catch (error) {
    console.error('[Pin] List error:', error);
    socket.emit('chat:error', { error: 'Failed to load pinned messages' });
  }
}

function emitPinsUpdated(socket: Socket, roomId: string, pinnedMessages: unknown[]) {
  // A door's wrapped socket (and a telnet connection) has no socket.to
  if (typeof socket.to === 'function') socket.to(roomId).emit('chat:pin:updated', { roomId, pinnedMessages });
  socket.emit('chat:pin:updated', { roomId, pinnedMessages });
}

export function setupPinHandlers(socket: Socket, session: any) {
  if (!session.user?.id || !session.user?.username) return;

  // Pinning writes into any room by id, and listing reads any room's pins,
  // private rooms included. These are the sysop's until a room-membership
  // rule is asked for (open-surface audit, 2026-10-04). The livechat door's
  // emits do not arrive here (they go to the browser); createDoorSocketWrapper
  // routes them to the handle* functions above, with the same level check.
  onLevel(socket, 'chat:pin:add', SYSOP_LEVEL, (caller: BBSSession, data: { roomId: string; messageId: number }) => handlePinAdd(socket, caller, data));
  onLevel(socket, 'chat:pin:remove', SYSOP_LEVEL, (caller: BBSSession, data: { roomId: string; messageId: number }) => handlePinRemove(socket, caller, data));
  onLevel(socket, 'chat:pin:list', SYSOP_LEVEL, (caller: BBSSession, data: { roomId: string }) => handlePinList(socket, caller, data));
}
