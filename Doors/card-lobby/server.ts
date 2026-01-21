/**
 * Card Lobby - Hybrid Door Server Component
 *
 * Wraps the main card lobby implementation and adds RPC handlers
 * for the hybrid client (audio support).
 */

import door, { metadata as cardLobbyMetadata } from './index';

type DoorSession = {
  socket?: {
    emit: (event: string, data: any) => void;
  };
  bbsSession?: {
    doorInputHandler?: (data: string) => void;
  };
};

export const metadata = {
  ...cardLobbyMetadata,
};

/**
 * Emit a sound event to the client
 */
export function emitSound(session: DoorSession, soundType: string): void {
  if (session?.socket?.emit) {
    session.socket.emit('door-message', { type: 'sound', data: { type: soundType } });
  }
}

/**
 * RPC handler for forwarding client input to the door
 */
function forwardInput(params: { raw?: string }, session?: DoorSession): { ok: boolean } {
  const raw = typeof params?.raw === 'string' ? params.raw : '';
  const handler = session?.bbsSession?.doorInputHandler;

  if (!raw || typeof handler !== 'function') {
    return { ok: false };
  }

  handler(raw);
  return { ok: true };
}

/**
 * RPC handler for polling UNO table events
 * Returns events that occurred after the provided lastEventId
 */
function pollTableEvents(
  params: { tableId?: number; lastEventId?: string },
  session?: DoorSession
): { ok: boolean; events?: any[] } {
  // Note: This is a simplified implementation
  // In a real multi-node setup, this would query the Storage API
  // For now, events are propagated via socket.io 'unoEvent' emissions
  return { ok: true, events: [] };
}

/**
 * RPC handler for broadcasting UNO events to all table players
 * This is called when a UNO action occurs that needs to be broadcast
 */
function broadcastUnoEvent(
  params: { tableId?: number; type?: string; data?: any },
  session?: DoorSession
): { ok: boolean } {
  const { tableId, type, data } = params;

  if (!tableId || !type) {
    return { ok: false };
  }

  // Emit event via socket to all connected clients
  // The door instance will handle adding it to the event queue
  if (session?.socket?.emit) {
    session.socket.emit('unoEventBroadcast', { tableId, type, data });
  }

  return { ok: true };
}

export const rpcHandlers = {
  input: forwardInput,
  pollTableEvents,
  broadcastUnoEvent,
};

export default door;
