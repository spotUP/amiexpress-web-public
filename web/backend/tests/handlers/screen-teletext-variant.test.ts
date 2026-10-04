/**
 * ANSI teletext screens (.ttx) - WEB_ extension, T answer at the graphics
 * prompt. Behavioural throughout: findSecurityScreen takes an explicit base
 * path, and the variant lists inline in loadScreenFile are driven through
 * the loader on a scratch board (config.set('dataDir')).
 *
 * Priority: .SEQ (petscii) > .RIP (rip) > .TTX (teletext) > user type >
 * .TXT. Native packet-level .TTI is deliberately NOT served until
 * rendered (packet bytes as ANSI is noise): a stem with only .tti falls
 * through to .txt. A T session without authored .ttx art falls back to
 * .txt, which still renders in the TDAText face.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findSecurityScreen } from '../../src/utils/screen-security.util';

const FIXTURES = path.resolve(__dirname, '../fixtures/board-screens');

function fixtureBase(stem: string): string {
  return path.join(FIXTURES, stem);
}

/** Minimal native packet frame (edit.tf / wxTED / Marco family grammar). */
const NATIVE_TTI = 'DE,Native test page\nPN,10000\nSC,0000\nCT,8,C\nPS,8000\nOL,0,  NATIVE PACKETS\nOL,2, Hello from packets.\nOL,23, Page 100\n';

describe('findSecurityScreen - teletext slot', () => {
  test('.ttx wins for a teletext session', () => {
    const found = findSecurityScreen(fixtureBase('teletext-menu'), 0, null, false, false, false, true);
    expect(found).not.toBeNull();
    expect(found!.toLowerCase().endsWith('.ttx')).toBe(true);
  });

  test('.txt wins when no mode flag is set', () => {
    const found = findSecurityScreen(fixtureBase('teletext-menu'), 0);
    expect(found).not.toBeNull();
    expect(found!.toLowerCase().endsWith('.txt')).toBe(true);
  });

  test('.SEQ still wins when both petscii and teletext flags are set', () => {
    // A T session is never simultaneously PETSCII (the T branch clears
    // petsciiMode), but the order must be total anyway.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttx-pri-'));
    fs.writeFileSync(path.join(dir, 'PRI.txt'), 'ansi fallback');
    fs.writeFileSync(path.join(dir, 'PRI.ttx'), 'teletext art');
    fs.writeFileSync(path.join(dir, 'PRI.SEQ'), 'petscii art');
    const found = findSecurityScreen(path.join(dir, 'PRI'), 0, null, false, false, true, true);
    expect(found).not.toBeNull();
    expect(found!.toLowerCase().endsWith('.seq')).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('.RIP still wins when both rip and teletext flags are set', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttx-pri-'));
    fs.writeFileSync(path.join(dir, 'PRI.txt'), 'ansi fallback');
    fs.writeFileSync(path.join(dir, 'PRI.ttx'), 'teletext art');
    fs.writeFileSync(path.join(dir, 'PRI.RIP'), 'rip art');
    const found = findSecurityScreen(path.join(dir, 'PRI'), 0, null, true, false, false, true);
    expect(found).not.toBeNull();
    expect(found!.toLowerCase().endsWith('.rip')).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('a native .tti wins the security slot once validated as packets', () => {
    // Preference, not rendering: findSecurityScreen answers paths. The
    // loader renders (or falls through) afterwards - packet bytes are
    // never served raw, proven by the loadScreenFile cases below.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttx-native-'));
    fs.writeFileSync(path.join(dir, 'NAT.txt'), 'ansi fallback');
    fs.writeFileSync(path.join(dir, 'NAT.tti'), NATIVE_TTI);
    const found = findSecurityScreen(path.join(dir, 'NAT'), 0, null, false, false, false, true);
    expect(found).not.toBeNull();
    expect(found!.toLowerCase().endsWith('.tti')).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('a non-packet .tti still takes the security slot (loader falls back)', () => {
    // The slot answers paths; validation and rendering happen in the
    // loader, which falls through to the .ttx twin for non-packets.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttx-native-'));
    fs.writeFileSync(path.join(dir, 'NAT.ttx'), 'ansi teletext');
    fs.writeFileSync(path.join(dir, 'NAT.tti'), 'just some ANSI text\n');
    const found = findSecurityScreen(path.join(dir, 'NAT'), 0, null, false, false, false, true);
    expect(found).not.toBeNull();
    expect(found!.toLowerCase().endsWith('.tti')).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('a stem with only .txt still resolves in a teletext session (fallback)', () => {
    const found = findSecurityScreen(fixtureBase('screens-menu'), 0, null, false, false, false, true);
    expect(found).not.toBeNull();
    expect(found!.toLowerCase().endsWith('.txt')).toBe(true);
  });
});

describe('loadScreenFile - teletext wins end to end on a scratch board', () => {
  // The top-level entry, driven: a tmp board with Node0 art proves the new
  // code RAN (isTeletext flag + .ttx bytes), not just that a helper
  // answers. The config singleton bakes dataDir at construction, so the
  // board is pointed with config.set (restored after) - env alone arrives
  // too late. Tmp dir, nothing on the shared board.
  let board = '';
  let oldDataDir = '';

  beforeEach(() => {
    board = fs.mkdtempSync(path.join(os.tmpdir(), 'ttx-board-'));
    fs.mkdirSync(path.join(board, 'Node0'), { recursive: true });
    fs.writeFileSync(path.join(board, 'Node0', 'BBSTITLE.ttx'), 'TELETEXT TITLE');
    fs.writeFileSync(path.join(board, 'Node0', 'BBSTITLE.txt'), 'ANSI TITLE');
    const { config } = require('../../src/config');
    oldDataDir = config.getConfig().dataDir;
    config.set('dataDir', board);
  });

  afterEach(() => {
    const { config } = require('../../src/config');
    config.set('dataDir', oldDataDir);
    fs.rmSync(board, { recursive: true, force: true });
  });

  test('a teletext session is served the .ttx with the flag set', () => {
    const { loadScreenFile } = require('../../src/handlers/screen.handler');
    const screen = loadScreenFile('BBSTITLE', undefined, 0, { texttvMode: true });
    expect(screen).not.toBeNull();
    expect(screen!.content).toContain('TELETEXT TITLE');
    expect(screen!.isTeletext).toBe(true);
    expect(screen!.isRip).toBe(false);
    expect(screen!.isPetscii).toBe(false);
  });

  test('an ANSI session is served the .txt with no flag', () => {
    const { loadScreenFile } = require('../../src/handlers/screen.handler');
    const screen = loadScreenFile('BBSTITLE', undefined, 0, { texttvMode: false });
    expect(screen).not.toBeNull();
    expect(screen!.content).toContain('ANSI TITLE');
    expect(screen!.isTeletext).toBeFalsy();
  });

  test('a teletext session falls back to .txt when no .ttx exists', () => {
    fs.rmSync(path.join(board, 'Node0', 'BBSTITLE.ttx'));
    const { loadScreenFile } = require('../../src/handlers/screen.handler');
    const screen = loadScreenFile('BBSTITLE', undefined, 0, { texttvMode: true });
    expect(screen).not.toBeNull();
    expect(screen!.content).toContain('ANSI TITLE');
    expect(screen!.isTeletext).toBeFalsy();
  });

  test('a native .tti renders to ANSI through the loader, never raw', () => {
    fs.writeFileSync(path.join(board, 'Node0', 'BBSTITLE.tti'), NATIVE_TTI);
    const { loadScreenFile } = require('../../src/handlers/screen.handler');
    const screen = loadScreenFile('BBSTITLE', undefined, 0, { texttvMode: true });
    expect(screen).not.toBeNull();
    expect(screen!.content).toContain('Hello from packets');
    expect(screen!.content).not.toContain('OL,2');
    expect(screen!.isTeletext).toBe(true);
  });

  test('an unrenderable .tti falls back instead of serving noise', () => {
    // Validated at the security slot but unrenderable at load (truncated
    // packets): the .ttx twin serves, not the packet bytes.
    fs.writeFileSync(path.join(board, 'Node0', 'BBSTITLE.tti'), 'DE,broken\nOL,0,');
    const { loadScreenFile } = require('../../src/handlers/screen.handler');
    const screen = loadScreenFile('BBSTITLE', undefined, 0, { texttvMode: true });
    expect(screen).not.toBeNull();
    expect(screen!.content).toContain('TELETEXT TITLE');
    expect(screen!.isTeletext).toBe(true);
  });
});
describe('loadScreenFile - teletext variant lists, driven', () => {
  // What the variant lists inside loadScreenFile decide, observed through
  // the loader on a scratch board. Lookups are case-insensitive
  // (findCaseInsensitive / amigafs), so the order of `.ttx` against `.TTX` is
  // not a behaviour; what is, is teletext art of EITHER case beating `.txt`.
  let board = '';
  let oldDataDir = '';

  beforeEach(() => {
    board = fs.mkdtempSync(path.join(os.tmpdir(), 'ttx-variants-'));
    fs.mkdirSync(path.join(board, 'Node0'), { recursive: true });
    fs.mkdirSync(path.join(board, 'Art'), { recursive: true });
    const { config } = require('../../src/config');
    oldDataDir = config.getConfig().dataDir;
    config.set('dataDir', board);
  });

  afterEach(() => {
    const { config } = require('../../src/config');
    config.set('dataDir', oldDataDir);
    fs.rmSync(board, { recursive: true, force: true });
  });

  test('a name that already ends in .ttx or .tti has the extension swapped, not appended', () => {
    fs.writeFileSync(path.join(board, 'Art', 'PAGE.txt'), 'ANSI PAGE');
    const { loadScreenFile } = require('../../src/handlers/screen.handler');
    for (const asked of ['PAGE.ttx', 'PAGE.tti']) {
      const screen = loadScreenFile(path.join(board, 'Art', asked), undefined, 0, { texttvMode: false });
      expect({ asked, content: screen?.content }).toEqual({ asked, content: 'ANSI PAGE' });
    }
  });

  // The security walk answers first and would hide the variant lists, so
  // each case below also carries an unrenderable .tti: the security slot takes
  // it, rendering fails, and the loader falls through to the variant walk -
  // the list under test (same route as "an unrenderable .tti falls back").
  const BROKEN_TTI = 'DE,broken\nOL,0,';

  test('upper-case .TTX art still beats .txt for a teletext session', () => {
    fs.writeFileSync(path.join(board, 'Node0', 'BBSTITLE.tti'), BROKEN_TTI);
    fs.writeFileSync(path.join(board, 'Node0', 'BBSTITLE.TTX'), 'UPPER TELETEXT');
    fs.writeFileSync(path.join(board, 'Node0', 'BBSTITLE.txt'), 'ANSI TITLE');
    const { loadScreenFile } = require('../../src/handlers/screen.handler');
    const screen = loadScreenFile('BBSTITLE', undefined, 0, { texttvMode: true });
    expect(screen?.content).toContain('UPPER TELETEXT');
    expect(screen?.isTeletext).toBe(true);
  });

  test('the AWAITSCREEN arm routes a teletext session to its .ttx', () => {
    fs.writeFileSync(path.join(board, 'Node0', 'AWAITSCREEN.tti'), BROKEN_TTI);
    fs.writeFileSync(path.join(board, 'Node0', 'AWAITSCREEN.ttx'), 'TELETEXT AWAIT');
    fs.writeFileSync(path.join(board, 'Node0', 'AWAITSCREEN.txt'), 'ANSI AWAIT');
    const { loadScreenFile } = require('../../src/handlers/screen.handler');
    const teletext = loadScreenFile('AWAITSCREEN', undefined, 0, { texttvMode: true });
    expect(teletext?.content).toContain('TELETEXT AWAIT');
    expect(teletext?.isTeletext).toBe(true);
  });

  test('the general arm routes a teletext session to its .ttx', () => {
    fs.mkdirSync(path.join(board, 'Conf1'), { recursive: true });
    fs.writeFileSync(path.join(board, 'Conf1', 'Menu.tti'), BROKEN_TTI);
    fs.writeFileSync(path.join(board, 'Conf1', 'Menu.ttx'), 'TELETEXT MENU');
    fs.writeFileSync(path.join(board, 'Conf1', 'Menu.txt'), 'ANSI MENU');
    const { loadScreenFile } = require('../../src/handlers/screen.handler');
    const teletext = loadScreenFile('MENU', 1, 0, { texttvMode: true });
    expect(teletext?.content).toContain('TELETEXT MENU');
    expect(teletext?.isTeletext).toBe(true);
  });

  test('the assign-path arm tries .ttx before .txt for a teletext session', () => {
    // An absolute path (what ~SR_/~SS_ resolve to) takes extOrder, not the
    // variant builders.
    fs.writeFileSync(path.join(board, 'Art', 'PAGE.ttx'), 'TELETEXT PAGE');
    fs.writeFileSync(path.join(board, 'Art', 'PAGE.txt'), 'ANSI PAGE');
    const { loadScreenFile } = require('../../src/handlers/screen.handler');
    const teletext = loadScreenFile(path.join(board, 'Art', 'PAGE'), undefined, 0, { texttvMode: true });
    expect(teletext?.content).toBe('TELETEXT PAGE');
    const ansi = loadScreenFile(path.join(board, 'Art', 'PAGE'), undefined, 0, { texttvMode: false });
    expect(ansi?.content).toBe('ANSI PAGE');
  });
});

describe('shipped teletext seeds resolve through the loader', () => {
  // The board's own .ttx art, COPIED into a scratch board and served by the
  // real loader pointed at it: the bytes are the shipped seeds, the board
  // is not. The jest live-data guard forbids reading the checkout as a
  // board, so the seeds travel. The property asserted is the VARIANT
  // preference (a behaviour of this change), never a byte of the art.
  const REPO_ROOT = path.resolve(__dirname, '../../../..');
  let board = '';
  let oldDataDir = '';

  beforeEach(() => {
    board = fs.mkdtempSync(path.join(os.tmpdir(), 'ttx-seeds-'));
    for (const rel of ['Node1/BBSTITLE.ttx', 'Node1/BBSTITLE.txt', 'Screens/Conf/Menu.ttx', 'Screens/Conf/Menu.txt']) {
      const dst = path.join(board, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(path.join(REPO_ROOT, rel), dst);
    }
    const { config } = require('../../src/config');
    oldDataDir = config.getConfig().dataDir;
    config.set('dataDir', board);
  });

  afterEach(() => {
    const { config } = require('../../src/config');
    config.set('dataDir', oldDataDir);
    fs.rmSync(board, { recursive: true, force: true });
  });

  test('Node1/BBSTITLE.ttx wins for a teletext session', () => {
    const { loadScreenFile } = require('../../src/handlers/screen.handler');
    const screen = loadScreenFile('BBSTITLE', undefined, 1, { texttvMode: true });
    expect(screen).not.toBeNull();
    expect(screen!.filePath.toLowerCase().endsWith('.ttx')).toBe(true);
    expect(screen!.isTeletext).toBe(true);
  });

  test('Node1/BBSTITLE.txt still wins without the flag', () => {
    const { loadScreenFile } = require('../../src/handlers/screen.handler');
    const screen = loadScreenFile('BBSTITLE', undefined, 1, { texttvMode: false });
    expect(screen).not.toBeNull();
    expect(screen!.filePath.toLowerCase().endsWith('.txt')).toBe(true);
    expect(screen!.isTeletext).toBeFalsy();
  });

  test('the board menu Screens/Conf/Menu.ttx wins for a teletext session in conference 1', () => {
    const { loadScreenFile } = require('../../src/handlers/screen.handler');
    const screen = loadScreenFile('MENU', 1, 1, { texttvMode: true });
    expect(screen).not.toBeNull();
    expect(screen!.filePath.toLowerCase().endsWith('.ttx')).toBe(true);
    expect(screen!.isTeletext).toBe(true);
  });
});
