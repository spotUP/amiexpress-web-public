/**
 * A theme's `Files/` copy of a logo is what a caller wearing the theme reads.
 *
 * Artist in theme 607080, 2026-10-02: the studio showed the BOARD's
 * `Screens/logoff/001.logoff.txt` with "This is one of the board's own
 * screens", although her own `Themes/607080/Files/Screens/logoff/
 * 001.logoff.txt` was already uploaded - and the same for `uprough.txt`. She
 * only saw her upload after pressing "Redraw this in 607080's screens".
 *
 * The loader serves that copy: every by-path candidate goes through
 * `themedPath` first (screen.handler.ts, `pathCandidates`). The themed index
 * resolved `~SS_`/`~SR_` targets against the board alone, so the theme's copy
 * was read by nothing, landed in `unused`, and the studio (which hides unread
 * files) kept the board's card in its place.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { buildScreenIndex, invalidateScreenIndex } from '../../src/screens/screen-index.service';
import { clearThemeRegistryCache, writeTheme } from '../../src/screens/theme-registry';

let root: string;

const write = (rel: string, body: string) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'latin1');
};

const themeCopy = (rel: string) => path.join('Themes', '607080', 'Files', rel);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-files-read-'));
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), 'NCONFS=1\nNAME.1=Amiga\nLOCATION.1=BBS:Conf1/\n');
  fs.mkdirSync(path.join(root, 'Conf1'));

  // The board: a logon that splices in a logo, a logoff that picks from a pool.
  write('Node1/LOGON.TXT', '~SS_BBS:Screens/uprough.txt\r\n');
  write('Node1/LOGOFF.TXT', '~99SR_BBS:Screens/logoff/logoff.txt\r\n');
  write('Screens/uprough.txt', 'the board logo\r\n');
  write('Screens/logoff/001.logoff.txt', 'the board logoff\r\n');

  // The artist's uploads, in the theme's verbatim mirror of the board root.
  write(themeCopy('Screens/uprough.txt'), 'the artist logo\r\n');
  write(themeCopy('Screens/logoff/001.logoff.txt'), 'the artist logoff\r\n');

  clearThemeRegistryCache();
  writeTheme(root, {
    slug: '607080', title: '607080', author: 'artist', owner: 'artist',
    dir: 'Themes/607080', widths: [80], doorTheme: '', status: 'draft',
  });
  clearThemeRegistryCache();
  invalidateScreenIndex();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  clearThemeRegistryCache();
  invalidateScreenIndex();
});

test.each([
  ['a pool member picked by ~SR_', 'Screens/logoff/001.logoff.txt', 'LOGOFF'],
  ['a logo spliced in by ~SS_', 'Screens/uprough.txt', 'LOGON'],
])('the theme\'s copy of %s is read by the screen that names it', (_what, boardRel, screen) => {
  const index = buildScreenIndex(root, '607080');
  const mine = themeCopy(boardRel);

  expect(index.files[mine]?.readBy).toEqual(
    expect.arrayContaining([expect.objectContaining({ screen, via: 'include' })]),
  );
  expect(index.unused.map(f => f.relPath)).not.toContain(mine);
});

test('the board\'s own copy is still read - callers not wearing the theme are served it', () => {
  const index = buildScreenIndex(root, '607080');

  expect(index.files[path.join('Screens', 'logoff', '001.logoff.txt')]?.readBy?.length).toBeGreaterThan(0);
  expect(index.unused.map(f => f.relPath)).not.toContain(path.join('Screens', 'logoff', '001.logoff.txt'));
});

test('the board\'s own index credits no theme file', () => {
  const index = buildScreenIndex(root);

  expect(index.files[themeCopy('Screens/uprough.txt')]?.readBy ?? []).toEqual([]);
});
