/**
 * The screen index as a caller wearing a theme sees it.
 *
 * The manager had one index - the board's - and a theme's files sat in it
 * unresolved, so the sysop opened Themes/tango/Board/BULL.TXT and was told
 * "no screen on this board reads this file", which is false: every caller
 * wearing tango reads it. He asked for one selector on the screens page that
 * turns the gallery and the tables into that theme's view. So the index is
 * built per theme, and a theme's file is tagged in the board's own.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildScreenIndex, getScreenIndex, invalidateScreenIndex } from '../../src/screens/screen-index.service';
import { clearThemeRegistryCache, writeTheme } from '../../src/screens/theme-registry';

let root: string;
const write = (rel: string, body: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body, 'latin1');
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'themed-index-'));
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  write('Screens/BULL.TXT', 'the board bulletin\r\n');
  write('Screens/MAILSCAN.TXT', 'the board mailscan\r\n');
  writeTheme(root, {
    slug: 'neon', title: 'Neon', author: 'skope', owner: 'skope', dir: 'Themes/neon',
    widths: [80], doorTheme: '', status: 'live',
  } as never);
  write('Themes/neon/Board/BULL.TXT', 'the neon bulletin\r\n');
  clearThemeRegistryCache();
  invalidateScreenIndex();
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); invalidateScreenIndex(); });

const bull = (index: ReturnType<typeof buildScreenIndex>) =>
  index.screens.find(s => s.screen === 'BULL')!.resolutions.map(r => r.file);

test("the board's own index resolves BULL to the board, and tags the theme's copy", () => {
  const index = buildScreenIndex(root);

  expect(bull(index)).toEqual([path.join('Screens', 'BULL.TXT')]);
  const neon = index.files[path.join('Themes', 'neon', 'Board', 'BULL.TXT')];
  expect(neon.theme).toBe('neon');
  // Read by whoever wears neon: NOT an orphan.
  expect(index.unused.map(f => f.relPath)).not.toContain(neon.relPath);
});

test("the theme's index resolves BULL to the theme, and the rest falls through to the board", () => {
  const index = buildScreenIndex(root, 'neon');

  expect(bull(index)).toEqual([path.join('Themes', 'neon', 'Board', 'BULL.TXT')]);
  const neonBull = index.files[path.join('Themes', 'neon', 'Board', 'BULL.TXT')];
  expect(neonBull.readBy.some(r => r.via === 'resolved')).toBe(true);
  // MAILSCAN is not in the theme, so a neon caller gets the board's.
  expect(index.screens.find(s => s.screen === 'MAILSCAN')!.resolutions.map(r => r.file))
    .toEqual([path.join('Screens', 'MAILSCAN.TXT')]);
});

test("a theme file nothing in that theme resolves IS an orphan - but only in that theme's view", () => {
  write('Themes/neon/Board/nobody.txt', 'dangling\r\n');
  invalidateScreenIndex();

  expect(buildScreenIndex(root, 'neon').unused.map(f => f.relPath))
    .toContain(path.join('Themes', 'neon', 'Board', 'nobody.txt'));
  expect(buildScreenIndex(root).unused.map(f => f.relPath))
    .not.toContain(path.join('Themes', 'neon', 'Board', 'nobody.txt'));
});

test('each theme is cached on its own - asking for the board after the theme does not hand back the theme', () => {
  const themed = getScreenIndex(root, 'neon');
  const board = getScreenIndex(root);

  expect(bull(themed)[0]).toContain('Themes');
  expect(bull(board)[0]).not.toContain('Themes');
  expect(getScreenIndex(root, 'neon')).toBe(themed);
  expect(getScreenIndex(root)).toBe(board);
});
