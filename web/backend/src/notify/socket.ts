/**
 * The browser's half of the push subscribe round trip (see push.ts):
 * `notify:push-subscription`. Registered through onCaller, so a visitor who has
 * not logged on is dropped before the handler, and the user saved for is the
 * session's.
 */
import type { Socket } from 'socket.io';
import { db } from '../database';
import { onCaller } from '../server/socket-guard';
import { acceptPushSubscription } from './push';

export function registerNotifySocketHandlers(socket: Socket): void {
  onCaller(socket, 'notify:push-subscription', (session, payload: unknown) => {
    acceptPushSubscription(session, payload, () => (db as any).db);
  });
}
