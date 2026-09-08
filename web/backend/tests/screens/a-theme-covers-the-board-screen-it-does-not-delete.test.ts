/**
 * A theme covers the board's screen; it does not kill it.
 *
 * The themed index walks the theme's directories first, and they answer first.
 * The walk used to stop there, so the board's own `Conf1/MENU250.TXT` was
 * claimed by nobody and the screen manager said, of the main menu every caller
 * NOT wearing the theme is served: "No screen on this board reads this file -
 * at any security level, in any screen type, and no other screen includes it".
 * The sysop, 2026-09-08: "almost all screens in the gallery says [that] but
 * it's not true. even the obvious mainmenus and confbulls say it". Measured on
 * the live board: selecting a theme moved a hundred files from read to unread.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { buildScreenIndex } from '../../src/screens/screen-index.service';
import { clearThemeRegistryCache, writeTheme } from '../../src/screens/theme-registry';
import { invalidateScreenIndex } from '../../src/screens/screen-index.service';

let root: string;

const write = (rel: string, body: string) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'latin1');
};
const readersOf = (slug: string | undefined, rel: string) =>
  buildScreenIndex(root, slug).files[rel]?.readBy ?? [];

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-shadow-'));
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), 'NCONFS=1\nNAME.1=Amiga\nLOCATION.1=BBS:Conf1/\n');
  fs.mkdirSync(path.join(root, 'Node1'));

  // The board's own screens.
  write('Conf1/Menu.txt', 'the board menu\r\n');
  write('Node1/Logon.txt', 'the board logon\r\n');
  // A theme that redraws both.
  write('Themes/neon/Conf/1/Menu.txt', 'the neon menu\r\n');
  write('Themes/neon/Node/Logon.txt', 'the neon logon\r\n');
  clearThemeRegistryCache();
  writeTheme(root, {
    slug: 'neon', title: 'Neon', author: 'Skope', owner: 'skope',
    dir: 'Themes/neon', widths: [80], doorTheme: '', status: 'live',
  });
  clearThemeRegistryCache();
  invalidateScreenIndex();
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  clearThemeRegistryCache();
  invalidateScreenIndex();
});

test('the board\'s own menu is still read when a theme covers it', () => {
  const readers = readersOf('neon', path.join('Conf1', 'Menu.txt'));

  expect(readers.map(r => r.screen)).toContain('MENU');
  expect(readers[0].via).toBe('shadowed');
  expect(readers[0].shadowedBy).toBe('neon');
});

test('and it is not in the list of files nothing reads', () => {
  const index = buildScreenIndex(root, 'neon');

  expect(index.unused.map(f => f.relPath)).not.toContain(path.join('Conf1', 'Menu.txt'));
  expect(index.unused.map(f => f.relPath)).not.toContain(path.join('Node1', 'Logon.txt'));
});

test('the theme\'s own screen is the one a caller wearing it is served', () => {
  const index = buildScreenIndex(root, 'neon');
  const menu = index.screens.find(s => s.screen === 'MENU')!;

  expect(menu.resolutions[0].file).toBe(path.join('Themes', 'neon', 'Conf', '1', 'Menu.txt'));
  expect(readersOf('neon', path.join('Themes', 'neon', 'Conf', '1', 'Menu.txt'))[0].via).toBe('resolved');
});

test('the board\'s own index is unchanged - nothing is shadowed there', () => {
  const readers = readersOf(undefined, path.join('Conf1', 'Menu.txt'));

  expect(readers[0].via).toBe('resolved');
  expect(readers[0].shadowedBy).toBeUndefined();
});

test('a screen the theme does not carry is served from the board, not shadowed', () => {
  write('Conf1/FileHelp.txt', 'the board file help\r\n');
  invalidateScreenIndex();

  const readers = readersOf('neon', path.join('Conf1', 'FileHelp.txt'));

  expect(readers[0].via).toBe('resolved');
  expect(readers[0].shadowedBy).toBeUndefined();
});
