/**
 * A theme mirrors the scope the BOARD reads a file at, not the directory name.
 *
 * Two ways the name rule got it wrong, both measured on the live board
 * (2026-09-08):
 *
 * - 215 of this board's nodes read `Screens/Node/`, not `Node<n>/`, because
 *   that is what their SCREENS tooltype says. `Screens/Node/BBSTITLE.txt` was
 *   read as an ordinary file and mirrored to `Files/Screens/Node/BBSTITLE.txt`
 *   - a path the loader reads only for an absolute-path include - beside the
 *   `Node/BBSTITLE.txt` the seeder wrote from another node. Every theme on the
 *   live board carries both copies, and the artist sees the screen twice.
 *
 * - `Screens/flt.txt` is a LOGO, pulled into LOGON by path. It was mirrored to
 *   `Board/flt.txt`, and the Board scope is searched by catalogue screen NAME,
 *   so an artist who redrew a logo drew something no caller can be served.
 */
process.env.SKIP_DB_INIT = '1';

const users: Array<{ username: string }> = [{ username: 'sysop' }];
jest.mock('../../src/services/UserFileManager', () => ({
  userFileManager: { readAllUsers: () => users },
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../../src/config';
import { clearThemeRegistryCache, readThemeRegistry, writeTheme } from '../../src/screens/theme-registry';
import { invalidateScreenIndex, getScreenIndex } from '../../src/screens/screen-index.service';
import { seedThemeFromBoard, copyScreenIntoTheme } from '../../src/screens/theme-seeding';
import { themeTargetForBoardFile } from '../../src/screens/theme-target-path';

let root: string;
let previousDataDir: string;

const write = (rel: string, body: string) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'latin1');
};
const themeFile = (rel: string) => path.join(root, 'Themes', 'neon', rel);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-scope-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');

  // Two nodes that read a SHARED screen directory, the way this board's do.
  write('Node1/.keep', '');
  write('Node2/.keep', '');
  fs.writeFileSync(path.join(root, 'Node1.info'), 'SCREENS=BBS:Screens/Node/\n');
  fs.writeFileSync(path.join(root, 'Node2.info'), 'SCREENS=BBS:Screens/Node/\n');
  write('Screens/Node/BBSTITLE.txt', 'the title\r\n');
  write('Screens/Node/LOGON.TXT', 'the logon\r\n');

  // A board screen, and a LOGO that only an include reaches.
  write('Screens/BULL.TXT', 'the bulletin\r\n');
  write('Screens/flt.txt', 'a group logo\r\n');

  fs.mkdirSync(path.join(root, 'Themes', 'neon'), { recursive: true });
  clearThemeRegistryCache();
  writeTheme(root, {
    slug: 'neon', title: 'Neon', author: 'skope', owner: 'skope',
    dir: path.join('Themes', 'neon'), widths: [80], doorTheme: '', status: 'draft',
  });
  clearThemeRegistryCache();
  invalidateScreenIndex();
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
  clearThemeRegistryCache();
  invalidateScreenIndex();
});

const theme = () => readThemeRegistry(root).themes.find(entry => entry.slug === 'neon')!;

describe('a node screen the nodes share', () => {
  it('lands in the theme Node scope, once', () => {
    seedThemeFromBoard(root, theme());

    expect(fs.existsSync(themeFile(path.join('Node', 'BBSTITLE.txt')))).toBe(true);
    expect(fs.existsSync(themeFile(path.join('Files', 'Screens', 'Node', 'BBSTITLE.txt')))).toBe(false);
  });

  it('is redrawn into the same one place', () => {
    copyScreenIntoTheme(root, theme(), 'Screens/Node/LOGON.TXT');

    expect(fs.existsSync(themeFile(path.join('Node', 'LOGON.TXT')))).toBe(true);
    expect(fs.existsSync(themeFile(path.join('Files', 'Screens', 'Node', 'LOGON.TXT')))).toBe(false);
  });
});

describe('a logo the board pulls in by path', () => {
  it('is redrawn into the Files mirror, which is the tree that arm reads', () => {
    const result = copyScreenIntoTheme(root, theme(), 'Screens/flt.txt');

    expect(result.copied.map(c => c.target)).toEqual([path.join('Files', 'Screens', 'flt.txt')]);
    expect(fs.existsSync(themeFile(path.join('Files', 'Screens', 'flt.txt')))).toBe(true);
    expect(fs.existsSync(themeFile(path.join('Board', 'flt.txt')))).toBe(false);
  });

  it('does not take the Board scope away from a catalogue screen', () => {
    const index = getScreenIndex(root);

    expect(themeTargetForBoardFile(index, 'Screens/BULL.TXT')).toBe(path.join('Board', 'BULL.TXT'));
    expect(themeTargetForBoardFile(index, 'Screens/flt.txt')).toBe(path.join('Files', 'Screens', 'flt.txt'));
    expect(themeTargetForBoardFile(index, '../../etc/passwd')).toBeNull();
  });
});
