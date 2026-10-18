// @ts-nocheck
/**
 * Ctrl+C with the command palette open over a door closes the palette.
 *
 * The bug (sysop, 2026-10-18): Ctrl+C while the palette was open over a door
 * reached the palette as a raw 0x03 the menu door ignores, the web client's
 * door:terminate ended the 68K door underneath, and an ARexx script was
 * aborted before routing ever saw the palette.
 *
 * Now Ctrl+C is the palette's while it is open: it closes it as Esc does, and
 * the door under it is not ended. The web client's door:terminate takes the
 * same route (ctrl-c-from-the-web-client-ends-a-typescript-door.test.ts).
 */
import { EventEmitter } from 'events';

jest.mock('../../src/handlers/command-execution.handler', () => ({ runBbsCommand: jest.fn(), commandCache: { bbscmd: new Map() } }));

import { runBbsCommand } from '../../src/handlers/command-execution.handler';
import { openPaletteOverDoor, deliverToPalette, isPaletteOpen } from '../../src/services/palette-over-door';

const settle = () => new Promise((resolve) => setImmediate(resolve));

let keys: string[];
beforeEach(() => {
  keys = [];
  (runBbsCommand as jest.Mock).mockImplementation((_s: any, shadowSession: any) => new Promise<void>((done) => {
    // The menu door closes on Esc (sdk/c/src/menudoor.c UI_KEY_ESC).
    shadowSession.doorInputHandler = (key: string) => { keys.push(key); if (key === '\x1b') done(); };
  }));
});

function caller() {
  const socket: any = new EventEmitter();
  socket.id = 'palette-ctrlc-' + Math.random();
  socket.emit = () => true;
  const session: any = {
    doorHold: { pause: jest.fn(), resume: jest.fn() },
    closeRunningTsDoor: jest.fn(),
    scriptAbortHandler: jest.fn(),
  };
  return { socket, session };
}

test('a typed Ctrl+C closes the palette and leaves the door running', async () => {
  const { socket, session } = caller();
  openPaletteOverDoor(socket, session);
  await settle();
  deliverToPalette(session, '\x03');
  await settle(); await settle();
  expect(keys).toEqual(['\x1b']);
  expect(isPaletteOpen(session)).toBe(false);
  expect(session.closeRunningTsDoor).not.toHaveBeenCalled();
  expect(session.scriptAbortHandler).not.toHaveBeenCalled();
  expect(session.doorHold.resume).toHaveBeenCalledTimes(1);
});
