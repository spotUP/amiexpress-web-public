// @ts-nocheck
/**
 * A bulletin picked from the palette over a TypeScript or ARexx door shows.
 *
 * The bug (sysop, 2026-10-18): over a 68K door a bulletin ("show") pick from
 * the palette showed the bulletin; over a TypeScript or ARexx door the door
 * ended and nothing showed. Their exit tails run the pick through
 * runPickLeftByTheDoor, which only knew how to run a command.
 *
 * Now runPickLeftByTheDoor shows the bulletin and reopens the menu, as the
 * 68K tail does with menuExit.show.
 */
import 'reflect-metadata';
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, LOCALHOST_IPS: [] };
});
jest.mock('../../src/amiga-emulation/loader/LibraryLoader', () => ({ LibraryLoader: jest.fn() }));
jest.mock('../../src/amiga-emulation/AmigaDoorSession', () => ({ AmigaDoorSession: jest.fn() }));
jest.mock('../../src/services/DoorDropFileManager');
jest.mock('../../src/services/CallersLogManager');
jest.mock('../../src/handlers/commands/menu-door-exit', () => ({
  ...jest.requireActual('../../src/handlers/commands/menu-door-exit'),
  showBulletinThenReopen: jest.fn(async () => undefined),
}));

import { runPickLeftByTheDoor } from '../../src/handlers/door.handler';
import { armMenuExit, showBulletinThenReopen, takeMenuExit } from '../../src/handlers/commands/menu-door-exit';

test('a show pick left by the door shows the bulletin', async () => {
  const socket: any = { id: 'show-pick', emit: jest.fn() };
  const session: any = {};
  const show = { kind: 'bulletins', key: '1', command: 'B 1' };
  armMenuExit(session, { show });

  await expect(runPickLeftByTheDoor(socket, session)).resolves.toBe(true);
  expect(showBulletinThenReopen).toHaveBeenCalledWith(socket, session, show);
  expect(takeMenuExit(session)).toEqual({});
});
