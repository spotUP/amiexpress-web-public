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

export const rpcHandlers = {
  input: forwardInput,
};

export default door;
