/**
 * The board's own screens have to be editable too.
 *
 * `default` is the board itself: it has no directory of its own, so
 * `themeDirectory` answers null for it and an account given it could write
 * nothing at all. The sysop, 2026-09-08: "while developing amiexpress the
 * sysop needs to be able to edit the default theme as well, also tango needs
 * to be able to do it as he will make it".
 *
 * The grant is the ART, never the board: the global screen tree, a node's
 * screen directory when it is a shared one, and each conference's Screens/.
 * A conference's own directory holds its message base and a node's holds the
 * callers log - those stay the sysop's.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { config } from '../../src/config';
import { clearThemeRegistryCache, writeTheme } from '../../src/screens/theme-registry';
import { mayWriteScreen, writableRoots, boardScreenRoots } from '../../src/screens/theme-sandbox';

let root: string;
let previousDataDir: string;

const tango = { username: 'tango', secLevel: 100 };
const stranger = { username: 'nobody', secLevel: 100 };
const sysop = { username: 'sysop', secLevel: 255 };

const write = (rel: string, body: string) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'latin1');
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'board-theme-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), 'NCONF=1\nNAME.1=Main\nLOCATION.1=Conf1/\n');

  write('Screens/BULL.TXT', 'the board bulletin\r\n');
  write('Screens/Node/BBSTITLE.txt', 'the shared node title\r\n');
  write('Conf1/Screens/MENU.TXT', 'the conference menu\r\n');
  write('Conf1/MsgBase/HeaderFile', 'not art\r\n');
  write('Node1/CallersLog', 'not art\r\n');
  fs.writeFileSync(path.join(root, 'Node1.info'), 'SCREENS=BBS:Screens/Node/\n');

  clearThemeRegistryCache();
  // The board's own screens, owned by the artist who is drawing them.
  writeTheme(root, {
    slug: 'default', title: "The board's own screens", author: 'tango', owner: 'tango',
    dir: '', widths: [80], doorTheme: '', status: 'live',
  });
  clearThemeRegistryCache();
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
  clearThemeRegistryCache();
});

describe('an artist who owns the board\'s own screens', () => {
  it('may draw the board\'s art', () => {
    expect(mayWriteScreen(root, tango, 'Screens/BULL.TXT')).toBe(true);
    expect(mayWriteScreen(root, tango, path.join('Screens', 'Node', 'BBSTITLE.txt'))).toBe(true);
    expect(mayWriteScreen(root, tango, path.join('Conf1', 'Screens', 'MENU.TXT'))).toBe(true);
  });

  it('may not write the board\'s state', () => {
    expect(mayWriteScreen(root, tango, path.join('Conf1', 'MsgBase', 'HeaderFile'))).toBe(false);
    expect(mayWriteScreen(root, tango, path.join('Node1', 'CallersLog'))).toBe(false);
    expect(mayWriteScreen(root, tango, 'user.data')).toBe(false);
    expect(mayWriteScreen(root, tango, 'ConfConfig.info')).toBe(false);
  });

  it('is the OWNER only - the grant does not leak to every artist', () => {
    expect(mayWriteScreen(root, stranger, 'Screens/BULL.TXT')).toBe(false);
    expect(writableRoots(root, stranger)).toEqual([]);
  });

  it('leaves the sysop with the whole board, as before', () => {
    expect(writableRoots(root, sysop)).toEqual([path.resolve(root)]);
    expect(mayWriteScreen(root, sysop, path.join('Conf1', 'MsgBase', 'HeaderFile'))).toBe(true);
  });

  it('grants the art directories the board actually reads', () => {
    const roots = boardScreenRoots(root).map(dir => path.relative(root, dir));

    expect(roots).toContain('Screens');
    expect(roots).toContain(path.join('Conf1', 'Screens'));
    // Node1 reads Screens/Node, which is inside the tree already granted; its
    // own directory is state and is never a root.
    expect(roots).not.toContain('Node1');
  });
});
