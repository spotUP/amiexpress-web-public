/**
 * A caller is not refused by their own corpse.
 *
 * express.e:29715-29727 refuses the same account on two nodes at once, and
 * this port decided "is somebody on that node" with `sessions.has(nodeId)`.
 * That is map membership, not liveness. A BBSSession outlives its transport,
 * so a caller whose connection had gone still held the node and their OWN
 * next login was refused against it:
 *
 *     [CallersLog] Node1: Login infant
 *     [CallersLog] Node1: User infant already on another node!
 *     [BBSEventEmitter] Emitted user_logout: infant (node 1)
 *
 * That is a real caller on the live board, and `spot` and `sysop` hit it
 * repeatedly - 28 refusals across the node CallersLogs, the most recent
 * AFTER the three previous attempts to fix this (2026-09-10 x2, 2026-09-11).
 *
 * The question is REACHABILITY: can anything still be sent to that node?
 * Telnet and SSH register a connection emitter, and both teardown and the
 * admin's kick unregister it. Web has no registered emitter, so its socket
 * must still be in the namespace - Socket.IO removes it on disconnect.
 * A session with neither is not reachable, and must not refuse anyone.
 */
process.env.SKIP_DB_INIT = '1';

import { nodeHasReachableCaller } from '../../src/server/session-emitter-registry';
import { sessions } from '../../src/server/session-manager';

/** A session on a node, as the maps hold it. */
function putSession(nodeId: number, extra: Record<string, unknown>): void {
  sessions.set(String(nodeId), { nodeId, state: 'LOGGEDON', ...extra } as never);
}

/** A namespace holding exactly these socket ids. */
const namespaceWith = (...ids: string[]) => (id: string) => ids.includes(id);

describe('deciding whether a node still has a caller', () => {
  afterEach(() => { sessions.clear(); });

  it('says no for a web session whose socket has gone', () => {
    // The reported bug: the session object is still in the map, the caller is
    // not on the other end of it, and their next login was refused by it.
    putSession(1, { socketId: 'dead-socket' });

    expect(nodeHasReachableCaller(1, namespaceWith('some-other-socket'))).toBe(false);
  });

  it('says yes for a web session whose socket is still in the namespace', () => {
    // The guard must still do its job: a genuine second tab is refused.
    putSession(1, { socketId: 'live-socket' });

    expect(nodeHasReachableCaller(1, namespaceWith('live-socket'))).toBe(true);
  });

  it('says yes for telnet or SSH while its emitter is registered', () => {
    // No socketId at all on these; the registered emitter is the transport.
    putSession(2, { connectionEmitter: { emit: () => {} } });

    expect(nodeHasReachableCaller(2, namespaceWith())).toBe(true);
  });

  it('says no once the emitter is unregistered, which is what teardown and kick do', () => {
    putSession(2, { connectionEmitter: undefined });

    expect(nodeHasReachableCaller(2, namespaceWith())).toBe(false);
  });

  it('says no for a session carrying neither a socket nor an emitter', () => {
    // Nothing can be sent to this node, so it may not hold the account.
    putSession(3, {});

    expect(nodeHasReachableCaller(3, namespaceWith('anything'))).toBe(false);
  });

  it('says no for a node with no session at all', () => {
    expect(nodeHasReachableCaller(9, namespaceWith('anything'))).toBe(false);
  });

  it('reads the node key as a string, however it is asked', () => {
    // `sessions` is keyed by nodeId.toString() and by nothing else.
    putSession(4, { socketId: 'live-socket' });

    expect(nodeHasReachableCaller(4, namespaceWith('live-socket'))).toBe(true);
    expect(nodeHasReachableCaller('4', namespaceWith('live-socket'))).toBe(true);
  });
});
