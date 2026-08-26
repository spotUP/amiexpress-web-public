/**
 * A BBS event reaches a door exactly once.
 *
 * Reported with a screenshot: every line in the LiveChat log appeared twice -
 *
 *   [EVENT] infant has logged in (Node 1)
 *   *** infant has logged in (Node 1) ***
 *   [09:51 PM] * infant logged in from Irvine, CA (Node 1)
 *   [EVENT] infant has logged in (Node 1)
 *   *** infant has logged in (Node 1) ***
 *   [09:51 PM] * infant logged in from Irvine, CA (Node 1)
 *
 * The live log shows the server emitting it ONCE
 * ("[BBSEventEmitter] Emitted user_login: infant (node 1)"), so the copy was
 * made on the way in. There were two routes:
 *
 *   1. bbsEventEmitter.broadcast -> io.emit('bbs:event') -> the socket's
 *      onAnyOutgoing hook -> dispatchLocal -> the door's handlers
 *   2. a bridge in createDoorSocketWrapper subscribing to the same emitter
 *      and calling dispatchLocal itself
 *
 * The bridge's comment claimed "io.emit() only reaches browser clients", but
 * onAnyOutgoing fires for broadcasts too - proven by a live stack trace where
 * a broadcast reached a door handler through notifyOutgoingListeners. So both
 * routes fired and the door drew everything twice.
 */

import { createDoorSocketWrapper } from '../../src/handlers/door.handler';
import { bbsEventEmitter } from '../../src/services/bbs-event-emitter';

/** A socket that behaves like socket.io's, including outgoing interception. */
function makeSocket() {
  const outgoing: Array<(event: string, ...args: any[]) => void> = [];
  const listeners = new Map<string, Array<(...args: any[]) => void>>();

  const socket: any = {
    id: 'socket-door',
    onAnyOutgoing: (fn: any) => { outgoing.push(fn); },
    offAnyOutgoing: (fn: any) => {
      const i = outgoing.indexOf(fn);
      if (i >= 0) outgoing.splice(i, 1);
    },
    on: (event: string, fn: any) => {
      const list = listeners.get(event) ?? [];
      list.push(fn);
      listeners.set(event, list);
    },
    off: () => undefined,
    removeAllListeners: () => undefined,
    emit: (event: string, ...args: any[]) => {
      // What socket.io does for an outgoing packet: notify the hooks.
      outgoing.forEach(fn => fn(event, ...args));
      return true;
    },
    to: () => ({ emit: () => undefined }),
    join: () => undefined,
    leave: () => undefined,
  };

  /** Simulate io.emit reaching THIS socket (a broadcast, not a direct emit). */
  const broadcastToSocket = (event: string, payload: any) => {
    outgoing.forEach(fn => fn(event, payload));
  };

  return { socket, broadcastToSocket };
}

describe('a door receiving BBS events', () => {
  it('does not subscribe the door to the event emitter a second time', () => {
    const before = bbsEventEmitter.listenerCount('bbs:event');

    const { socket } = makeSocket();
    createDoorSocketWrapper(socket, { nodeId: 1 } as any, {} as any);

    // The broadcast route already delivers; a second subscription here is
    // what drew every event twice.
    expect(bbsEventEmitter.listenerCount('bbs:event')).toBe(before);
  });

  it('delivers a broadcast BBS event to the door exactly once', () => {
    const { socket, broadcastToSocket } = makeSocket();
    const wrapped = createDoorSocketWrapper(socket, { nodeId: 1 } as any, {} as any);

    const seen: any[] = [];
    wrapped.on('bbs:event', (payload: any) => seen.push(payload));

    broadcastToSocket('bbs:event', { username: 'infant', eventType: 'user_login' });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ username: 'infant' });
  });

  it('still delivers other broadcast events to the door', () => {
    const { socket, broadcastToSocket } = makeSocket();
    const wrapped = createDoorSocketWrapper(socket, { nodeId: 1 } as any, {} as any);

    const seen: any[] = [];
    wrapped.on('chat:message', (m: any) => seen.push(m));

    broadcastToSocket('chat:message', { content: 'hello' });

    expect(seen).toHaveLength(1);
  });
});
