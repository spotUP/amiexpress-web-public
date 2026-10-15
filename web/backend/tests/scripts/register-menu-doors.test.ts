/**
 * M19: the menu step registers MENU and MENUSETTINGS through the admin writer, and a
 * rerun leaves them exactly as they are (writeNewDoorRegistration alone overwrites).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
const fail = { on: false };
jest.mock('../../src/utils/info-file.util', () => {
  const actual = jest.requireActual('../../src/utils/info-file.util');
  return { ...actual, applyTooltypes: (...a: unknown[]) => { if (fail.on) throw new Error('disk full'); return (actual.applyTooltypes as (...x: unknown[]) => void)(...a); } };
});
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

test('a failure between the two writers leaves no half-written .info, and the next run completes it', () => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'rmd2-'));
  try {
    fail.on = true;
    expect(() => STEPS.menu(r)).toThrow('disk full');
    expect(fs.existsSync(path.join(r, 'Commands', 'BBSCmd', 'MENUSETTINGS.info'))).toBe(false);
    expect(fs.readdirSync(r).filter((n) => n.startsWith('.register-'))).toEqual([]);
    fail.on = false;
    STEPS.menu(r);
    expect(fs.existsSync(path.join(r, 'Commands', 'BBSCmd', 'MENU.info'))).toBe(true);
  } finally { fail.on = false; fs.rmSync(r, { recursive: true, force: true }); }
});

test('--force-repair rewrites an existing registration', () => {
  fs.writeFileSync(info('MENU'), 'garbage\r\n');
  STEPS.menu(root, true);
  expect(tt('MENU').DESCRIPTION).toBe('The main menu');
});
