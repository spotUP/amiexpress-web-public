/**
 * DOORS (a WEB_ command) with nothing to list printed its own "Press any
 * key to continue..." and parked the caller in DISPLAY_CONF_BULL, which
 * rejoins the conference on the next key. A command ends at the menu with
 * the board's own pause (express.e:28645-28647).
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/doors/amigaDoorManager', () => ({
  getAmigaDoorManager: () => ({ scanInstalledDoors: async () => [] }),
}));

import { displayDoorMenu, setDoors } from '../../src/handlers/door.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { flushOutput } from '../../src/utils/output.util';

test('an empty door list says so and returns to the menu with its pause', async () => {
  setDoors([]);
  const said: string[] = [];
  const socket: any = { id: 'doors-empty', emit: (e: string, d: unknown) => { if (e === 'ansi-output') said.push(String(d)); return true; }, on: () => socket };
  const session: any = { nodeId: 1, currentConf: 1, screenWidth: 80, tempData: {}, user: { id: 'u1', username: 'SPOT', securityFlags: 'T'.repeat(64) } };

  await displayDoorMenu(socket, session, '');
  flushOutput(socket);

  expect(said.join('')).toContain('No doors are currently available.');
  expect(said.join('')).not.toContain('Press any key');
  expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  expect(session.menuPause).toBe(true);
});
