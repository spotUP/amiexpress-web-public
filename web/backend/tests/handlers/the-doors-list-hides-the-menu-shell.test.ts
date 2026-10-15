/**
 * After the main menu cut-over MENU and MENUSETTINGS are real BBSCmd
 * registrations, and the caller's DOORS list showed them. The catalogue hid
 * them; the DOORS list had no rule. Both now read doors/unlisted-commands.ts.
 * Listing is the only thing hidden: the registry still holds them, so the
 * typed command still resolves.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/doors/amigaDoorManager', () => ({
  getAmigaDoorManager: () => ({ scanInstalledDoors: async () => [] }),
}));

import { displayDoorMenu, setDoors, getDoors } from '../../src/handlers/door.handler';
import { flushOutput } from '../../src/utils/output.util';
import { isListedDoor } from '../../src/doors/unlisted-commands';

const reg = (command: string, name: string) =>
  ({ id: command, command, name, type: 'XIM', enabled: true, accessLevel: 0, path: '' }) as any;

test('the DOORS list omits MENU and MENUSETTINGS but lists other doors and BULLS', async () => {
  setDoors([reg('MENU', 'ZZMENUSHELL'), reg('MENUSETTINGS', 'ZZMENUSETSHELL'), reg('FROGGER', 'ZZFROGGER'), reg('BULLS', 'ZZBULLS')]);
  const said: string[] = [];
  const socket: any = { id: 'doors-hide', emit: (e: string, d: unknown) => { if (e === 'ansi-output') said.push(String(d)); return true; }, on: () => socket };
  const session: any = { nodeId: 1, currentConf: 1, screenWidth: 80, tempData: {}, user: { id: 'u1', username: 'SPOT', securityFlags: 'T'.repeat(64) } };

  await displayDoorMenu(socket, session, '');
  flushOutput(socket);

  const out = said.join('');
  expect(out).toContain('ZZFROGGER');
  expect(out).toContain('ZZBULLS');
  expect(out).not.toContain('ZZMENUSHELL');
  expect(out).not.toContain('ZZMENUSETSHELL');
});

test('the typed command still resolves: the registry keeps the shell doors', () => {
  expect(getDoors().map((d) => d.command)).toEqual(expect.arrayContaining(['MENU', 'MENUSETTINGS']));
});

test('the one rule: shell names are unlisted in any case, a real door and BULLS are listed', () => {
  expect(isListedDoor('menu')).toBe(false);
  expect(isListedDoor({ command: 'MENUSETTINGS' })).toBe(false);
  expect(isListedDoor({ command: 'BULLS' })).toBe(true);
  expect(isListedDoor({ command: 'FROGGER' })).toBe(true);
});
