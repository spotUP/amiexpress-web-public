// @ts-nocheck
/**
 * Ctrl+C leaves a TypeScript door (sysop ruling 2026-10-18).
 *
 * PhreakWars only left on Q: 0x03 went to the door's input handler, which
 * ignored it, and the caller was stuck. The board now takes Ctrl+C from any
 * running TS door and ends it through the door's own close path - the SDK's
 * 'door:close' signal - so the door's onClose (save, goodbye) still runs.
 *
 * The test drives what both transports drive: routeDoorInput decides, and the
 * session's closeRunningTsDoor (set by executeTypeScriptDoor for a door that
 * did not declare KEEP_CTRL_C) is handed a door socket wrapper whose
 * _closeDoor fires 'door:close' at the door's own listeners. A real SDK Door
 * runs on that wrapper.
 */
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

import { routeDoorInput, doorKeepsCtrlC } from '../../src/services/door-input-routing';
import { Door } from '../../../../sdk/src/core/Door';

function realSocket(): any {
  return { id: 'S1', emit: jest.fn(), on: jest.fn(), once: jest.fn(), off: jest.fn(), server: {} };
}

/** A key as both transports route it while a TS door runs. */
function sendKey(session: any, key: string): void {
  const route = routeDoorInput(key, {
    doorActive: true,
    hasDoorInputHandler: Boolean(session.doorInputHandler),
    hasCommandListener: false,
    bbsPauseActive: false,
    ctrlCEndsDoor: Boolean(session.closeRunningTsDoor),
  });
  if (route.endDoor) { session.closeRunningTsDoor?.(); return; }
  if (route.toDoorHandler) session.doorInputHandler(key);
}

/** Start an SDK door the way executeTypeScriptDoor does. */
function startDoor(toolTypes: Record<string, string>) {
  const { createDoorSocketWrapper } = require('../../src/handlers/door.handler');
  const session: any = { nodeId: 1 };
  const wrapped = createDoorSocketWrapper(realSocket(), session, {});
  const keys: string[] = [];
  const closed = jest.fn();
  const door = new Door({ name: 'phreak', version: '1' } as any)
    .onInput((_ctx, k) => { keys.push(k.key); })
    .onClose(closed);
  // executeTypeScriptDoor's condition: the SDK input loop runs, no opt-out.
  if ((door as any).inputHandlers.length > 0 && !doorKeepsCtrlC({ toolTypes })) {
    session.closeRunningTsDoor = () => wrapped._closeDoor();
  }
  const running = door.execute({ socket: wrapped, bbsSession: session, user: undefined, bbs: {}, params: [] });
  return { session, keys, closed, running };
}

const tick = () => new Promise((r) => setImmediate(r));

describe('ctrl-c-leaves-a-typescript-door', () => {
  it('Ctrl+C ends a TS door and its onClose runs', async () => {
    const { session, keys, closed, running } = startDoor({});
    await tick();
    sendKey(session, 'x');
    expect(keys).toEqual(['x']);

    sendKey(session, '\x03');
    await running;

    expect(closed).toHaveBeenCalledTimes(1);
    expect(keys).toEqual(['x']); // the door never saw 0x03
    expect(session.doorInputHandler).toBeNull();
  });

  it('a door that declared KEEP_CTRL_C still receives 0x03', async () => {
    const { session, keys, closed } = startDoor({ KEEP_CTRL_C: '1' });
    await tick();
    sendKey(session, '\x03');
    await tick();

    expect(keys).toEqual(['\x03']);
    expect(closed).not.toHaveBeenCalled();
  });

  it('68K doors, ARexx and the board prompt are untouched: no closer, no end', () => {
    const route = routeDoorInput('\x03', {
      doorActive: true, hasDoorInputHandler: true, hasCommandListener: false, bbsPauseActive: false,
    });
    expect(route.endDoor).toBe(false);
    expect(route.toDoorHandler).toBe(true);
    expect(routeDoorInput('\x03', { doorActive: false, hasDoorInputHandler: false, hasCommandListener: false, bbsPauseActive: false, ctrlCEndsDoor: true }).toBbs).toBe(true);
    expect(routeDoorInput('\x03', { doorActive: true, hasDoorInputHandler: true, hasCommandListener: false, bbsPauseActive: false, paletteOpen: true, ctrlCEndsDoor: true }).toPalette).toBe(true);
  });
});
