/**
 * M19: the menu step registers MENU and MENUSETTINGS through the admin writer, and a
 * rerun leaves them exactly as they are (writeNewDoorRegistration alone overwrites).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { STEPS } from '../../src/scripts/register-menu-doors';
import { parseInfoFile } from '../../src/utils/info-file.util';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rmd-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const info = (n: string) => path.join(root, 'Commands', 'BBSCmd', `${n}.info`);
const tt = (n: string) => Object.fromEntries(parseInfoFile(info(n)).tooltypes.map((t: any) => [t.key, t.value]));

test('the menu step writes MENU and the W settings registration', () => {
  STEPS.menu(root);
  expect(tt('MENU')).toMatchObject({ LOCATION: 'Doors/MAINMENU/mainmenu', DESCRIPTION: 'The main menu', MIN_COLUMNS: '40', MULTINODE: 'YES', STACK: '8192' });
  expect(tt('MENUSETTINGS')).toMatchObject({ SETTINGS: 'YES', SETTINGS_LABEL: 'Long menus', SETTINGS_SECTION: 'Appearance', LOCATION: 'Doors/MAINMENU/mainmenu' });
});

test('a rerun keeps a sysop edit and the exact bytes', () => {
  const before = fs.readFileSync(info('MENU'));
  const edited = Buffer.concat([before, Buffer.from('ACCESS=50\r\n')]);
  fs.writeFileSync(info('MENU'), edited);
  STEPS.menu(root);
  STEPS.menu(root);
  expect(fs.readFileSync(info('MENU')).equals(edited)).toBe(true);
  expect(fs.readFileSync(info('MENUSETTINGS')).length).toBeGreaterThan(0);
});
