/**
 * Relays this board's BBS events (login, logout, upload, download, door
 * activity, door events, commands) to the door server's chat service, so the
 * LiveChat doors on Amiga (LIVECHAT68) print the same event lines the TS
 * LiveChat door prints from its socket. The hub shows a relayed event only to
 * chat sessions of this board.
 *
 * Fire and forget: a failed relay is logged and dropped; chat event lines are
 * not worth an outbox.
 */
import type { SystemConfig } from '../../database/types';
import { bbsEventEmitter, type BBSEventPayload } from '../bbs-event-emitter';
import { ChatClient, chatTarget } from './chat-client';

export interface BbsEventRelayDeps {
  getConfig: () => SystemConfig | null;
  /** Injectable for tests. */
  makeClient?: (target: NonNullable<ReturnType<typeof chatTarget>>) => Pick<ChatClient, 'relayBbsEvent'>;
}

/** Relay one event. Resolves false when the board has no door server or key. */
export async function relayBbsEvent(deps: BbsEventRelayDeps, payload: BBSEventPayload): Promise<boolean> {
  const target = chatTarget(deps.getConfig());
  if (!target) return false;
  const client = deps.makeClient ? deps.makeClient(target) : new ChatClient(target);
  await client.relayBbsEvent({
    type: payload.type,
    username: payload.username,
    nodeId: payload.nodeId,
    data: payload.data ?? {},
  });
  return true;
}

let listener: ((p: BBSEventPayload) => void) | null = null;

/** Subscribe to the board's event emitter. Calling it again replaces the old subscription. */
export function startBbsEventRelay(deps: BbsEventRelayDeps): void {
  stopBbsEventRelay();
  listener = (p) => {
    relayBbsEvent(deps, p).catch((err: unknown) => {
      console.warn(`[chat] bbs event relay failed: ${(err as Error).message}`);
    });
  };
  bbsEventEmitter.on('bbs:event', listener);
}

export function stopBbsEventRelay(): void {
  if (listener) bbsEventEmitter.off('bbs:event', listener);
  listener = null;
}
