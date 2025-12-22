/**
 * Card Lobby 2 - Hybrid Door Server Component
 *
 * Runs the existing Card Lobby server UI and exposes RPC handlers
 * for forwarding client input (web) to the server-side UI.
 */

import { runDoor as runCardLobbyDoor, metadata as cardLobbyMetadata } from '../card-lobby/index';

type DoorSession = {
  bbsSession?: {
    doorInputHandler?: (data: string) => void;
  };
};

export const metadata = {
  ...cardLobbyMetadata,
  name: 'Card Lobby 2',
  command: 'CARDLOBBY2',
};

export async function runDoor(session: DoorSession): Promise<void> {
  await runCardLobbyDoor(session as any);
}

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

export default { runDoor, metadata, rpcHandlers };
