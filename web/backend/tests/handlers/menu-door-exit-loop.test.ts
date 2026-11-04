/**
 * M7: a menu door's exit tail runs the pick, shows a bulletin and reopens the
 * door as one loop at constant depth - never one stack level per relaunch.
 */
const launched: string[] = [];
let depth = 0;
let maxDepth = 0;
const failOn = { command: '' };
jest.mock('../../src/handlers/command.handler', () => ({
  processCommand: jest.fn(async (s: any, session: any, cmd: string) => {
    if (cmd === failOn.command) throw new Error('door failed');
    depth++; maxDepth = Math.max(maxDepth, depth); launched.push(cmd);
    // a stand-in door: its exit tail parks the next relaunch, as the real tail does
    const exit = require('../../src/handlers/commands/menu-door-exit');
    exit.noteCallerInput(session, 'x');   // a caller who is using the door; an untouched, instantly-quitting one latches (M19)
    exit.enterExitTail(session);
    if (launched.length < 6) exit.parkDoor(session, 'MENU');
    exit.leaveExitTail(session);
    await exit.drainParkedDoors(s, session);
    depth--;
    return 'SUCCESS';
  }),
}));
jest.mock('../../src/handlers/door.handler', () => ({ theCallerIsLeaving: () => false }));
const order: string[] = [];
const showBulletin = jest.fn(async (..._a: unknown[]) => { order.push('bulletin'); return true; });
const pause = { answered: null as null | (() => void | Promise<void>) };
const doPause = jest.fn((_s: unknown, _x: unknown, cont?: () => void | Promise<void>) => { order.push('pause'); pause.answered = cont ?? null; });
jest.mock('../../src/handlers/commands/display-file-commands.handler', () => ({
  showBulletin: (...a: unknown[]) => showBulletin(...a),
}));
const screen = { defer: false, deferred: null as null | (() => void | Promise<void>) };
jest.mock('../../src/handlers/screen.handler', () => ({
  doPause: (...a: [unknown, unknown, (() => void | Promise<void>)?]) => doPause(...a),
  continueAfterScreen: jest.fn(async (_s: unknown, _x: unknown, cont: () => void | Promise<void>) => {
    if (!screen.defer) { await cont(); return false; }
    screen.deferred = cont;
    return true;
  }),
}));
jest.mock('../../src/services/menu-config.service', () => ({
  readMenuConfig: () => ({ config: { wipes: { open: '', leave: 'H', page: '' } } }),
}));
// The MENU relaunch goes through the guarded launch: a registered MENU with a binary on the board.
jest.mock('../../src/handlers/command-execution.handler', () => ({
  commandCache: { bbscmd: new Map([['MENU', { location: 'Doors/MAINMENU/mainmenu' }]]), syscmd: new Map() },
}));
const mockBoard = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'mloop-'));
require('fs').mkdirSync(require('path').join(mockBoard, 'Doors', 'MAINMENU'), { recursive: true });
require('fs').writeFileSync(require('path').join(mockBoard, 'Doors', 'MAINMENU', 'mainmenu'), 'x');
jest.mock('../../src/utils/board-root.util', () => ({ boardRoot: () => mockBoard }));
afterAll(() => require('fs').rmSync(mockBoard, { recursive: true, force: true }));

import * as exit from '../../src/handlers/commands/menu-door-exit';

beforeEach(() => {
  launched.length = 0; order.length = 0; doPause.mockClear(); pause.answered = null; depth = 0; maxDepth = 0; screen.defer = false; screen.deferred = null; failOn.command = ''; showBulletin.mockReset(); showBulletin.mockResolvedValue(true);
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
  expect(showBulletin).toHaveBeenCalledWith({}, session, 3, 'H', false);
  await pause.answered!();
  expect(launched[0]).toBe('B');
});

test('SHOW 12 NS (the caller typed B 12 NS) shows the bulletin non-stop', async () => {
  const session: any = {};
  await exit.showBulletinThenReopen({}, session, { kind: 'BULLETINS', key: '12', command: 'B', nonStop: true });
  expect(showBulletin).toHaveBeenCalledWith({}, session, 12, 'H', true);
});

test('a bulletin with a pause reopens B only when the pause is answered', async () => {
  const session: any = { paginatedScreen: { kind: 'doPause' } };
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
  await pause.answered!();   // the caller reads the board's "no such bulletin" line first
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

test('a relaunch that throws drops the rest of the parked queue, so the next unrelated exit starts clean', async () => {
  const session: any = {};
  failOn.command = 'B';
  exit.parkDoor(session, 'B');
  exit.parkDoor(session, 'MENU');
  await expect(exit.drainParkedDoors({}, session)).rejects.toThrow('door failed');
  expect(exit.hasParkedDoor(session)).toBe(false);
  expect(exit.inExitTail(session)).toBe(false);
});

test('a bulletin that cannot be shown still reopens B, so the caller is not left without a screen', async () => {
  const session: any = {};
  showBulletin.mockRejectedValueOnce(new Error('unreadable'));
  await exit.showBulletinThenReopen({}, session, { kind: 'BULLETINS', key: '3', command: 'B' });
  await pause.answered!();
  expect(launched[0]).toBe('B');
});

test('a bulletin with no pause of its own is held for a key before B is reopened', async () => {
  const session: any = {};
  await exit.showBulletinThenReopen({}, session, { kind: 'BULLETINS', key: '3', command: 'B' });
  expect(doPause).toHaveBeenCalledTimes(1);
  expect(launched).toEqual([]);                 // the reopen waits for the caller's key
  await pause.answered!();
  expect(launched[0]).toBe('B');
  expect(order.indexOf('bulletin')).toBeLessThan(order.indexOf('pause'));
});

test('a bulletin that already holds a pause gate is not paused twice', async () => {
  const session: any = { paginatedScreen: { kind: 'doPause' } };
  await exit.showBulletinThenReopen({}, session, { kind: 'BULLETINS', key: '3', command: 'B' });
  expect(doPause).not.toHaveBeenCalled();
});
