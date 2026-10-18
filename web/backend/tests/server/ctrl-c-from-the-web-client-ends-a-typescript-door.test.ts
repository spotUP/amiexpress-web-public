// @ts-nocheck
/**
 * Ctrl+C in the browser ends a TypeScript door (sysop, 2026-10-18 live:
 * "whip doesnt exit and aborting door is painting over the ui").
 *
 * The web client never sends Ctrl+C inside a door as the key: it sends
 * 'door:terminate' (packages/terminal BBSTerminal). Only the 68K door session
 * and the palette listened for that event, so a TS door's close
 * (closeRunningTsDoor) was never asked and WHIP stayed open, under the
 * client's own "[Aborting door...]" line.
 *
 * Driven through the real registerSocketHandlers on a fake socket (the
 * technique of game-mode-modifiers.test.ts), with a real SDK Door running on
 * the board's door socket wrapper and closeRunningTsDoor armed the way
 * executeTypeScriptDoor arms it.
 */
jest.mock('../../src/index', () => ({}));
jest.mock('../../src/services/UserFileManager', () => ({
  userFileManager: { writeUserFiles: jest.fn() }
}));
jest.mock('../../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: {
    getUserCount: jest.fn().mockReturnValue(0),
    userToStruct: jest.fn().mockReturnValue({ slotNumber: 0 }),
    userToKeys: jest.fn().mockReturnValue({}),
    userToMisc: jest.fn().mockReturnValue({}),
    appendUser: jest.fn(),
  }
}));
jest.mock('../../src/handlers/command-execution.handler', () => ({ runBbsCommand: jest.fn(), commandCache: { bbscmd: new Map() } }));

import { Door } from '../../../../sdk/src/core/Door';
import { runBbsCommand } from '../../src/handlers/command-execution.handler';
import { openPaletteOverDoor, isPaletteOpen } from '../../src/services/palette-over-door';

type Handler = (...args: any[]) => void;
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** A caller inside a running SDK door, on the real socket handlers. */
function callerInTsDoor(id: string) {
  const handlers: Record<string, Handler> = {};
  const socket: any = {
    id,
    handshake: { address: '127.0.0.1' },
    on(event: string, cb: Handler) { handlers[event] = cb; return socket; },
    onAny() { return socket; },
    emit() { return true; },
    join() { return socket; },
    removeAllListeners() { return socket; },
  };
  const session: any = { nodeId: 96, socketId: id, inDoorManager: true, doorHold: { pause: jest.fn(), resume: jest.fn() } };
  const { setSession, deleteSession } = require('../../src/server/session-manager');
  const { registerSocketHandlers } = require('../../src/server/socket-handlers');
  const { createDoorSocketWrapper } = require('../../src/handlers/door.handler');
  setSession(id, session);
  const io: any = { sockets: { sockets: new Map() }, emit() { return true; }, to() { return { emit() { return true; } }; } };
  registerSocketHandlers(io, socket);

  const doorSocket = { id, emit: jest.fn(), on: jest.fn(), once: jest.fn(), off: jest.fn(), server: {} };
  const wrapped = createDoorSocketWrapper(doorSocket, session, {});
  const closed = jest.fn();
  const door = new Door({ name: 'whip', version: '1' } as any).onInput(() => {}).onClose(closed);
  session.closeRunningTsDoor = () => wrapped._closeDoor();
  const running = door.execute({ socket: wrapped, bbsSession: session, user: undefined, bbs: {}, params: [] });
  return { socket, session, closed, running, terminate: () => handlers['door:terminate'](), cleanup: () => deleteSession(id) };
}

test("the web client's Ctrl+C ends the TS door and its onClose runs", async () => {
  const c = callerInTsDoor('web-ctrlc-ts-1');
  try {
    await settle();
    c.terminate();
    await c.running;
    expect(c.closed).toHaveBeenCalledTimes(1);
  } finally { c.cleanup(); }
});

test("under the palette it closes the palette and the door keeps running", async () => {
  const keys: string[] = [];
  (runBbsCommand as jest.Mock).mockImplementation((_s: any, shadowSession: any) => new Promise<void>((done) => {
    shadowSession.doorInputHandler = (key: string) => { keys.push(key); if (key === '\x1b') done(); };
  }));
  const c = callerInTsDoor('web-ctrlc-ts-2');
  try {
    await settle();
    openPaletteOverDoor(c.socket, c.session);
    await settle();
    c.terminate();
    await settle(); await settle();
    expect(keys).toEqual(['\x1b']);
    expect(isPaletteOpen(c.session)).toBe(false);
    expect(c.closed).not.toHaveBeenCalled();
    c.terminate();   // the door, no longer held, now takes the next Ctrl+C
    await c.running;
    expect(c.closed).toHaveBeenCalledTimes(1);
  } finally { c.cleanup(); }
});
