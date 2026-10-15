/**
 * M7: a menu door's exit tail runs the pick, shows a bulletin and reopens the
 * door as one loop at constant depth - never one stack level per relaunch.
 */
const launched: string[] = [];
let depth = 0;
let maxDepth = 0;
jest.mock('../../src/handlers/command.handler', () => ({
  processCommand: jest.fn(async (s: any, session: any, cmd: string) => {
    depth++; maxDepth = Math.max(maxDepth, depth); launched.push(cmd);
    // a stand-in door: its exit tail parks the next relaunch, as the real tail does
    const exit = require('../../src/handlers/commands/menu-door-exit');
    exit.enterExitTail(session);
    if (launched.length < 6) exit.parkDoor(session, 'MENU');
    exit.leaveExitTail(session);
    await exit.drainParkedDoors(s, session);
    depth--;
    return 'SUCCESS';
  }),
}));
jest.mock('../../src/handlers/door.handler', () => ({ theCallerIsLeaving: () => false }));
const showBulletin = jest.fn(async (..._a: unknown[]) => true);
jest.mock('../../src/handlers/commands/display-file-commands.handler', () => ({
  showBulletin: (...a: unknown[]) => showBulletin(...a),
}));
const screen = { defer: false, deferred: null as null | (() => void | Promise<void>) };
jest.mock('../../src/handlers/screen.handler', () => ({
  continueAfterScreen: jest.fn(async (_s: unknown, _x: unknown, cont: () => void | Promise<void>) => {
    if (!screen.defer) { await cont(); return false; }
    screen.deferred = cont;
    return true;
  }),
}));
jest.mock('../../src/services/menu-config.service', () => ({
  readMenuConfig: () => ({ config: { wipes: { open: '', leave: 'H', page: '' } } }),
}));
jest.mock('../../src/utils/board-root.util', () => ({ boardRoot: () => '/nowhere' }));

import * as exit from '../../src/handlers/commands/menu-door-exit';

beforeEach(() => {
  launched.length = 0; depth = 0; maxDepth = 0; screen.defer = false; screen.deferred = null; showBulletin.mockClear();
});

test('five menu relaunches run one after another at the same depth', async () => {
  const session: any = { state: 'loggedon' };
  exit.enterExitTail(session); exit.parkDoor(session, 'MENU'); exit.leaveExitTail(session);
  await exit.drainParkedDoors({}, session as never);
  expect(launched).toEqual(['MENU', 'MENU', 'MENU', 'MENU', 'MENU', 'MENU']);
  expect(maxDepth).toBe(1);
});

test('an inner tail never drains: only the outermost does', async () => {
  const session: any = {};
  exit.enterExitTail(session);
  exit.parkDoor(session, 'MENU');
  await exit.drainParkedDoors({}, session);
  expect(launched).toEqual([]);
  exit.leaveExitTail(session);
  expect(exit.inExitTail(session)).toBe(false);
  expect(exit.hasParkedDoor(session)).toBe(true);
});

test('a bulletin is shown through the board with the leave wipe, then B is reopened', async () => {
  const session: any = {};
  await exit.showBulletinThenReopen({}, session, { kind: 'BULLETINS', key: '3', command: 'B' });
  expect(showBulletin).toHaveBeenCalledWith({}, session, 3, 'H');
  expect(launched[0]).toBe('B');
});

test('a bulletin with a pause reopens B only when the pause is answered', async () => {
  const session: any = {};
  screen.defer = true;
  await exit.showBulletinThenReopen({}, session, { kind: 'BULLETINS', key: '7', command: 'B' });
  expect(launched).toEqual([]);
  await screen.deferred!();
  expect(launched[0]).toBe('B');
});

test('a bulletin that does not exist still reopens B', async () => {
  const session: any = {};
  showBulletin.mockResolvedValueOnce(false);
  await exit.showBulletinThenReopen({}, session, { kind: 'BULLETINS', key: '99', command: 'B' });
  expect(launched[0]).toBe('B');
});

test('dismissal is one-shot', () => {
  const s = {};
  exit.markMenuDoorDismissed(s);
  expect(exit.takeMenuDoorDismissed(s)).toBe(true);
  expect(exit.takeMenuDoorDismissed(s)).toBe(false);
});

test('a caller who is leaving gets no relaunch', async () => {
  const dh = require('../../src/handlers/door.handler');
  const spy = jest.spyOn(dh, 'theCallerIsLeaving').mockReturnValue(true);
  const session: any = {};
  exit.parkDoor(session, 'MENU');
  await exit.drainParkedDoors({}, session);
  expect(launched).toEqual([]);
  expect(exit.hasParkedDoor(session)).toBe(false);
  spy.mockRestore();
});
