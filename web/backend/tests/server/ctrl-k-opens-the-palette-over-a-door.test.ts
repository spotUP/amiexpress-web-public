/**
 * Ctrl+K inside a running door opens the command palette OVER the door.
 *
 * The bug: in the 68K J door Ctrl+K reached the door, so the palette (which
 * works at the prompt and in the menu door) never opened. The palette now
 * runs as a shadow over the paused door; Esc closes it, the whole held screen
 * is repainted and the door resumes.
 *
 * Driven through the web 'command' handler, the real entry point a key takes.
 * The palette's own door is replaced by a stand-in that takes keys and ends
 * on Esc; everything between the key and that run is the real code.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/index', () => ({}));
jest.mock('../../src/handlers/command-execution.handler', () => ({
  ...jest.requireActual('../../src/handlers/command-execution.handler'),
  runBbsCommand: jest.fn(),
}));
// The sentinel: the real openPaletteOverDoor, counted.
jest.mock('../../src/services/palette-over-door', () => {
  const actual = jest.requireActual('../../src/services/palette-over-door');
  return { ...actual, openPaletteOverDoor: jest.fn(actual.openPaletteOverDoor) };
});

import { registerCommandHandler } from '../../src/server/socket-handlers';
import { setSession, deleteSession } from '../../src/server/session-manager';
import { LoggedOnSubState, BBSState } from '../../src/constants/bbs-states';
import { commandCache, runBbsCommand } from '../../src/handlers/command-execution.handler';
import { feedScreenModel, dropScreenModel } from '../../src/services/screen-model/screen-model';
import * as palette from '../../src/services/palette-over-door';

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

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('Ctrl+K in a running door', () => {
  it('opens the palette over the paused door, and Esc gives the door back whole', async () => {
    const id = `ctrl-k-door-${Date.now()}`;
    const { handlers, emitted } = webCaller(id);
    const doorKeys: string[] = [];
    const pause = jest.fn();
    const resume = jest.fn();
    const doorInputHandler = (d: string) => { doorKeys.push(d); };
    const session: any = {
      nodeId: 94, state: BBSState.LOGGEDON, subState: LoggedOnSubState.DOOR_RUNNING, inDoorManager: true,
      connectionType: 'web', user: { id: 1, username: 'spot', secLevel: 255 }, tempData: {},
      doorInputHandler, doorHold: { pause, resume },
    };
    setSession(id, session);
    feedScreenModel(id, session, '\x1b[2J\x1b[HJOIN CONFERENCE');

    // The stand-in palette door: takes keys on its own session, ends on Esc,
    // and ends its run the way a door does (door-active false).
    const paletteKeys: string[] = [];
    let paletteSocket: any = null;
    (runBbsCommand as jest.Mock).mockImplementation((sock: any, sess: any, cmd: string) => new Promise((resolve) => {
      expect(cmd).toBe('PALETTE');
      paletteSocket = sock;
      sock.on('door:input', () => {});
      sess.inDoorManager = true;
      sess.doorInputHandler = (d: string) => {
        paletteKeys.push(d);
        if (d === '\x1b') {
          sess.inDoorManager = false;
          delete sess.doorInputHandler;
          sock.emit('door-active', false);
          resolve(0);
        }
      };
    }));
    commandCache.bbscmd.set('PALETTE', { name: 'PALETTE' } as any);
    const opened = palette.openPaletteOverDoor as jest.Mock;
    opened.mockClear();

    try {
      await handlers.get('command')!('\x0b');
      await settle();
      expect(opened).toHaveBeenCalledTimes(1);           // sentinel: the new path ran
      expect(pause).toHaveBeenCalledTimes(1);
      expect(doorKeys).toEqual([]);                      // Ctrl+K never reached the door
      expect(paletteSocket).not.toBeNull();

      await handlers.get('command')!('j');
      expect(paletteKeys).toEqual(['j']);                // the palette has the keys...
      expect(doorKeys).toEqual([]);                      // ...and the paused door none

      await handlers.get('command')!('\x1b');
      await settle();
      await settle();
      expect(resume).toHaveBeenCalledTimes(1);
      expect(palette.isPaletteOpen(session)).toBe(false);
      expect(session.doorInputHandler).toBe(doorInputHandler);
      expect(session.inDoorManager).toBe(true);
      expect(emitted).not.toContainEqual(['door-active', false]); // the client still sees the door
      const repaint = emitted.filter(([e]) => e === 'ansi-output').map(([, b]) => String(b)).pop() ?? '';
      expect(repaint).toContain('JOIN CONFERENCE');      // whole held screen repainted

      await handlers.get('command')!('y');
      expect(doorKeys).toEqual(['y']);                   // the door has its keys again
    } finally {
      commandCache.bbscmd.delete('PALETTE');
      dropScreenModel(id);
      deleteSession(id);
    }
  });
});
