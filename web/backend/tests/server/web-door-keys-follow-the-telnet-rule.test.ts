/**
 * A web caller's keys reach a running door by the same rule as telnet's.
 *
 * The web `command` handler routed door keys itself and differed from
 * services/door-input-routing.ts, which telnet asks, at the edges: with a BBS
 * pause on screen and a door running, a non-pause key and no door handler fell
 * through to the BBS command handler on web and went to the door on telnet
 * (web-vs-telnet audit item 8, 2026-09-28). Driven through the real web
 * `command` listener.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/index', () => ({}));

import { registerCommandHandler } from '../../src/server/socket-handlers';
import { setSession, deleteSession } from '../../src/server/session-manager';
import { LoggedOnSubState, BBSState } from '../../src/constants/bbs-states';

function webCaller(id: string) {
  const handlers = new Map<string, (...args: any[]) => any>();
  const emitted: Array<[string, unknown]> = [];
  const socket: any = {
    id,
    handshake: { address: '127.0.0.1' },
    connected: true,
    emit: (event: string, payload: unknown) => { emitted.push([event, payload]); return true; },
    join: () => {}, leave: () => {}, disconnect: () => {}, onAny: () => {},
    once: (event: string, h: any) => { handlers.set(event, h); return socket; },
    on: (event: string, h: any) => { handlers.set(event, h); return socket; },
    removeAllListeners: () => socket, removeListener: () => socket, listenerCount: () => 0,
  };
  registerCommandHandler(socket);
  return { socket, handlers, emitted };
}

describe('a web caller in a door, with a BBS pause on screen', () => {
  it('sends a non-pause key to the door, as telnet does - not to the BBS command handler', async () => {
    const id = `web-door-${Date.now()}`;
    const { handlers, emitted } = webCaller(id);
    const session: any = {
      nodeId: 93, state: BBSState.LOGGEDON, subState: LoggedOnSubState.DOOR_RUNNING, inDoorManager: true,
      connectionType: 'web', user: { id: 1, username: 'spot', secLevel: 255 }, tempData: {},
      paginatedScreen: { kind: 'bbs', lines: ['x'], nextIndex: 0, pageSize: 1 },
    };
    setSession(id, session);
    try {
      await handlers.get('command')!('x');
      expect(emitted).toContainEqual(['door:input', 'x']);
    } finally {
      deleteSession(id);
    }
  });
});
