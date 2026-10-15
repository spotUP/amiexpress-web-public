/**
 * A THEME THAT CANNOT DRESS A C64 DOES NOT GET TO SHADOW THE BOARD'S .SEQ.
 *
 * The sysop, 2026-09-15, minutes after 239 generated PETSCII screens went
 * live: "i dont think you 40 col seqs got added? ... the mainmenu is 80 cols".
 *
 * They had been added. The board's own log named the file it served instead:
 * `Themes/607080/Conf/2/Menu.txt`. A theme's directory is searched BEFORE the
 * board's, this board's active theme was made on the live volume, and nothing
 * in it is PETSCII - so its ANSI copy answered first and `Conf2/Menu.seq`,
 * one location further down, was never reached.
 *
 * The rule: where the theme has no PETSCII copy and the board does, the
 * board's is served. A theme WITH one still wins; a screen nobody has in
 * PETSCII still falls to the theme's ANSI.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { loadScreenFile } from '../../src/handlers/screen.handler';
import { config } from '../../src/config';
import { invalidateScreenIndex } from '../../src/screens/screen-index.service';

/** A .seq: the charset byte, white, then a word. */
const SEQ = Buffer.from([0x0e, 0x05, ...Buffer.from('BOARD MENU', 'latin1')]);
const THEME_SEQ = Buffer.from([0x0e, 0x05, ...Buffer.from('THEME MENU', 'latin1')]);
const ANSI = '\x1b[0;36mTHEME MENU IN EIGHTY COLUMNS\r\n';

let root: string;
let previousRoot: any;

const c64 = (): any => ({
  nodeId: 1,
  petsciiMode: true,
  screenWidth: 40,
  screenHeight: 25,
  user: { secLevel: 255 },
  currentConf: 1,
});

function board(theme: 'no-seq' | 'with-seq' | 'none'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-seq-'));
  fs.mkdirSync(path.join(dir, 'Conf1'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Conf1', 'Menu.txt'), 'the board ANSI menu\r\n', 'latin1');
  fs.writeFileSync(path.join(dir, 'Conf1', 'Menu.seq'), SEQ);

  // A theme is what the REGISTRY says it is (screens/theme-registry.ts): a
  // directory on its own is not a theme and is never searched.
  fs.writeFileSync(path.join(dir, 'ConfConfig.info'), '');
  fs.writeFileSync(path.join(dir, 'Themes.info'), [
    'TYPE.0=live', 'TITLE.0=Live', 'DIR.0=Themes/live', 'STATUS.0=live', 'WIDTHS.0=80', 'DEFAULT=live', '',
  ].join('\n'), 'latin1');

  if (theme !== 'none') {
    const themeDir = path.join(dir, 'Themes', 'live', 'Conf', '1');
    fs.mkdirSync(themeDir, { recursive: true });
    fs.writeFileSync(path.join(themeDir, 'Menu.txt'), ANSI, 'latin1');
    if (theme === 'with-seq') fs.writeFileSync(path.join(themeDir, 'Menu.seq'), THEME_SEQ);
  }
  return dir;
}

/** The loader, asked for the conference MENU as the theme'd board would ask. */
async function menuFor(dir: string, themeSlug: string | null): Promise<any> {
  const session = c64();
  // `screenThemeResolved` is what the loader reads (screen.handler.ts:1392):
  // the caller's theme, already judged by resolveCallerTheme.
  if (themeSlug) (session as any).screenThemeResolved = themeSlug;
  invalidateScreenIndex();
  return loadScreenFile('Menu', 1, 1, session);
}

afterEach(() => {
  if (previousRoot !== undefined) (config as any).set?.('dataDir', previousRoot);
});

describe('a theme with no PETSCII copy', () => {
  it('does not shadow the board\'s .seq for a 40-column caller', async () => {
    root = board('no-seq');
    previousRoot = config.get('dataDir');
    (config as any).set?.('dataDir', root);

    const result = await menuFor(root, 'live');

    // RED before the fix: this was the theme's ANSI Menu.txt.
    expect(result?.isPetscii).toBe(true);
    expect(String(result?.filePath)).toMatch(/Conf1[\\/]Menu\.seq$/);
  });
});

describe('a theme that HAS one', () => {
  it('still wins, because that is what a theme is for', async () => {
    root = board('with-seq');
    previousRoot = config.get('dataDir');
    (config as any).set?.('dataDir', root);

    const result = await menuFor(root, 'live');

    expect(result?.isPetscii).toBe(true);
    expect(String(result?.filePath)).toMatch(/Themes[\\/]live[\\/]Conf[\\/]1[\\/]Menu\.seq$/);
  });
});

/*
 * The same rule for a TELETEXT caller (sysop, 2026-10-05: "i tested t at the
 * prompt the bbs title is ansi not teletext"). The live log found the board's
 * `Screens/Node/BBSTITLE.tti` and served `Themes/h7/Node/BBSTITLE.txt`.
 */
describe('a theme with no teletext copy', () => {
  const teletext = (): any => ({
    nodeId: 1, texttvMode: true, screenWidth: 40, screenHeight: 25,
    user: { secLevel: 255 }, currentConf: 1, screenThemeResolved: 'live',
  });

  function teletextBoard(themeHasTtx: boolean): string {
    const dir = board('no-seq');
    fs.writeFileSync(path.join(dir, 'Conf1', 'Menu.ttx'), '\x1b[33mBOARD TELETEXT MENU\r\n', 'latin1');
    if (themeHasTtx) {
      fs.writeFileSync(path.join(dir, 'Themes', 'live', 'Conf', '1', 'Menu.ttx'), '\x1b[36mTHEME TELETEXT MENU\r\n', 'latin1');
    }
    return dir;
  }

  it('does not shadow the board\'s .ttx', async () => {
    root = teletextBoard(false);
    previousRoot = config.get('dataDir');
    (config as any).set?.('dataDir', root);
    invalidateScreenIndex();

    const result = await loadScreenFile('Menu', 1, 1, teletext());

    expect(String(result?.filePath)).toMatch(/Conf1[\\/]Menu\.ttx$/);
  });

  it('does not shadow it when the board\'s .tti is not packets and its .ttx twin is the copy', async () => {
    root = teletextBoard(false);
    // Live's Screens/Node/BBSTITLE.tti is ANSI text wearing the name.
    fs.writeFileSync(path.join(root, 'Conf1', 'Menu.tti'), '~SMO1|\n\x1b[0;33m 100 UP ROUGH BBS\r\n', 'latin1');
    previousRoot = config.get('dataDir');
    (config as any).set?.('dataDir', root);
    invalidateScreenIndex();

    const result = await loadScreenFile('Menu', 1, 1, teletext());

    expect(String(result?.filePath)).toMatch(/Conf1[\\/]Menu\.ttx$/);
  });

  it('a theme WITH one still wins', async () => {
    root = teletextBoard(true);
    previousRoot = config.get('dataDir');
    (config as any).set?.('dataDir', root);
    invalidateScreenIndex();

    const result = await loadScreenFile('Menu', 1, 1, teletext());

    expect(String(result?.filePath)).toMatch(/Themes[\\/]live[\\/]Conf[\\/]1[\\/]Menu\.ttx$/);
  });
});

/*
 * A file a screen names outright - `~SS_BBS:screens/uprough.txt` in the
 * logon screen - is read in the caller's alphabet too (sysop, 2026-10-05:
 * "the up rough ansi is not teletext").
 */
describe('a screen file named by path', () => {
  const teletextCaller = (): any => ({ nodeId: 1, texttvMode: true, screenWidth: 40, screenHeight: 25, user: { secLevel: 255 }, currentConf: 1 });

  it('is read from its .ttx twin for a teletext caller, and as named for everyone else', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'named-ttx-'));
    fs.writeFileSync(path.join(dir, 'uprough.txt'), '\x1b[0;31mUP ROUGH IN ANSI\r\n', 'latin1');
    fs.writeFileSync(path.join(dir, 'uprough.ttx'), '\x1b[0;33mUP ROUGH IN TELETEXT\r\n', 'latin1');
    const named = path.join(dir, 'uprough.txt');

    const teletext = await loadScreenFile(named, 1, 1, teletextCaller());
    expect(String(teletext?.filePath)).toMatch(/uprough\.ttx$/);

    const ansi = await loadScreenFile(named, 1, 1, { ...teletextCaller(), texttvMode: false });
    expect(String(ansi?.filePath)).toMatch(/uprough\.txt$/);
  });
});

/*
 * The same for a file named by path through the theme's Files/ mirror
 * (sysop, 2026-10-05: the Up Rough logo stayed ANSI in teletext - it came
 * from Themes/h7/Files/Screens/uprough.txt).
 */
describe('a theme mirror with no teletext copy of a named file', () => {
  it('does not shadow the board\'s .ttx', async () => {
    root = board('no-seq');
    fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Screens', 'uprough.txt'), '\x1b[0;31mBOARD ANSI\r\n', 'latin1');
    fs.writeFileSync(path.join(root, 'Screens', 'uprough.ttx'), '\x1b[0;33mBOARD TELETEXT\n', 'latin1');
    fs.mkdirSync(path.join(root, 'Themes', 'live', 'Files', 'Screens'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Themes', 'live', 'Files', 'Screens', 'uprough.txt'), '\x1b[0;35mTHEME ANSI\r\n', 'latin1');
    previousRoot = config.get('dataDir');
    (config as any).set?.('dataDir', root);
    invalidateScreenIndex();

    const caller: any = { nodeId: 1, texttvMode: true, screenWidth: 40, screenHeight: 25, user: { secLevel: 255 }, currentConf: 1, screenThemeResolved: 'live' };
    const result = await loadScreenFile('BBS:Screens/uprough.txt', 1, 1, caller);

    expect(String(result?.content)).toContain('BOARD TELETEXT');

    // An ANSI caller on the same theme still gets the theme's drawing.
    const ansi = await loadScreenFile('BBS:Screens/uprough.txt', 1, 1, { ...caller, texttvMode: false });
    expect(String(ansi?.content)).toContain('THEME ANSI');
  });
});
