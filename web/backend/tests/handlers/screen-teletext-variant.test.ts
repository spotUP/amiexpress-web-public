/**
 * Teletext screen variant (.tti) - WEB_ extension, T answer at the graphics
 * prompt. Behavioural where the loader allows it (findSecurityScreen takes
 * an explicit base path), structural where it does not (the variant lists
 * live inline in loadScreenFile - see screen-loader-case.test.ts for why
 * a source pin is proportionate there).
 *
 * Priority: .SEQ (petscii) > .RIP (rip) > .TTI (teletext) > user type >
 * .TXT. A T session without authored .tti art falls back to .txt, which
 * still renders in the TDAText face.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findSecurityScreen } from '../../src/utils/screen-security.util';

const FIXTURES = path.resolve(__dirname, '../fixtures/board-screens');

function fixtureBase(stem: string): string {
  return path.join(FIXTURES, stem);
}

describe('findSecurityScreen - teletext slot', () => {
  test('.tti wins for a teletext session', () => {
    const found = findSecurityScreen(fixtureBase('teletext-menu'), 0, null, false, false, false, true);
    expect(found).not.toBeNull();
    expect(found!.toLowerCase().endsWith('.tti')).toBe(true);
  });

  test('.txt wins when no mode flag is set', () => {
    const found = findSecurityScreen(fixtureBase('teletext-menu'), 0);
    expect(found).not.toBeNull();
    expect(found!.toLowerCase().endsWith('.txt')).toBe(true);
  });

  test('.SEQ still wins when both petscii and teletext flags are set', () => {
    // A T session is never simultaneously PETSCII (the T branch clears
    // petsciiMode), but the order must be total anyway.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-pri-'));
    fs.writeFileSync(path.join(dir, 'PRI.txt'), 'ansi fallback');
    fs.writeFileSync(path.join(dir, 'PRI.tti'), 'teletext art');
    fs.writeFileSync(path.join(dir, 'PRI.SEQ'), 'petscii art');
    const found = findSecurityScreen(path.join(dir, 'PRI'), 0, null, false, false, true, true);
    expect(found).not.toBeNull();
    expect(found!.toLowerCase().endsWith('.seq')).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('.RIP still wins when both rip and teletext flags are set', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-pri-'));
    fs.writeFileSync(path.join(dir, 'PRI.txt'), 'ansi fallback');
    fs.writeFileSync(path.join(dir, 'PRI.tti'), 'teletext art');
    fs.writeFileSync(path.join(dir, 'PRI.RIP'), 'rip art');
    const found = findSecurityScreen(path.join(dir, 'PRI'), 0, null, true, false, false, true);
    expect(found).not.toBeNull();
    expect(found!.toLowerCase().endsWith('.rip')).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('a stem with only .txt still resolves in a teletext session (fallback)', () => {
    // screens-menu.txt has no .tti sibling: the board serves it, in the
    // TDAText face, rather than failing the screen.
    const found = findSecurityScreen(fixtureBase('screens-menu'), 0, null, false, false, false, true);
    expect(found).not.toBeNull();
    expect(found!.toLowerCase().endsWith('.txt')).toBe(true);
  });
});

describe('loadScreenFile - teletext wins end to end on a scratch board', () => {
  // The top-level entry, driven: a tmp board with Node0 art proves the new
  // code RAN (isTeletext flag + .tti bytes), not just that a helper
  // answers. The config singleton bakes dataDir at construction, so the
  // board is pointed with config.set (restored after) - env alone arrives
  // too late. Tmp dir, nothing on the shared board.
  let board = '';
  let oldDataDir = '';

  beforeEach(() => {
    board = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-board-'));
    fs.mkdirSync(path.join(board, 'Node0'), { recursive: true });
    fs.writeFileSync(path.join(board, 'Node0', 'BBSTITLE.tti'), 'TELETEXT TITLE');
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

  test('a teletext session is served the .tti with the flag set', () => {
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

  test('a teletext session falls back to .txt when no .tti exists', () => {
    fs.rmSync(path.join(board, 'Node0', 'BBSTITLE.tti'));
    const { loadScreenFile } = require('../../src/handlers/screen.handler');
    const screen = loadScreenFile('BBSTITLE', undefined, 0, { texttvMode: true });
    expect(screen).not.toBeNull();
    expect(screen!.content).toContain('ANSI TITLE');
    expect(screen!.isTeletext).toBeFalsy();
  });
});
describe('loadScreenFile - teletext variant lists (structural pins)', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../src/handlers/screen.handler.ts'),
    'utf8',
  );

  test('SCREEN_EXTENSION_RE swaps .tti, not appends', () => {
    expect(src).toMatch(/SCREEN_EXTENSION_RE\s*=\s*\/\\\.\(seq\|txt\|rip\|tti\)/);
  });

  test('addTeletextVariants queues .tti before .TTI before .txt', () => {
    const body = src.match(/addTeletextVariants[\s\S]*?return\s+Array\.from\(variants\)/)?.[0];
    expect(body).toBeDefined();
    const tti = body!.search(/\$\{\w+\}\.tti`/);
    const TTI = body!.search(/\$\{\w+\}\.TTI`/);
    const txt = body!.search(/\$\{\w+\}\.txt`/);
    expect(tti).toBeGreaterThanOrEqual(0);
    expect(TTI).toBeGreaterThan(tti);
    expect(txt).toBeGreaterThan(TTI);
  });

  test('the selection arms route a teletext session to addTeletextVariants', () => {
    const hits = src.match(/wantsTeletext\)\s*\{\s*return[^;]*addTeletextVariants/g);
    // BBSTITLE, AWAITSCREEN and the general arm.
    expect(hits).not.toBeNull();
    expect(hits!.length).toBe(3);
  });

  test('the assign-path extOrder tries .tti first for a teletext session', () => {
    expect(src).toMatch(/session\?\.texttvMode === true[\s\S]*?'\.tti', '\.TTI'/);
  });
});

describe('shipped teletext seeds resolve through the loader', () => {
  // The board's own .tti art, COPIED into a scratch board and served by the
  // real loader pointed at it: the bytes are the shipped seeds, the board
  // is not. The jest live-data guard forbids reading the checkout as a
  // board, so the seeds travel. The property asserted is the VARIANT
  // preference (a behaviour of this change), never a byte of the art.
  const REPO_ROOT = path.resolve(__dirname, '../../../..');
  let board = '';
  let oldDataDir = '';

  beforeEach(() => {
    board = fs.mkdtempSync(path.join(os.tmpdir(), 'tti-seeds-'));
    for (const rel of ['Node1/BBSTITLE.tti', 'Node1/BBSTITLE.txt', 'Conf1/Menu.tti', 'Conf1/Menu.txt']) {
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

  test('Node1/BBSTITLE.tti wins for a teletext session', () => {
    const { loadScreenFile } = require('../../src/handlers/screen.handler');
    const screen = loadScreenFile('BBSTITLE', undefined, 1, { texttvMode: true });
    expect(screen).not.toBeNull();
    expect(screen!.filePath.toLowerCase().endsWith('.tti')).toBe(true);
    expect(screen!.isTeletext).toBe(true);
  });

  test('Node1/BBSTITLE.txt still wins without the flag', () => {
    const { loadScreenFile } = require('../../src/handlers/screen.handler');
    const screen = loadScreenFile('BBSTITLE', undefined, 1, { texttvMode: false });
    expect(screen).not.toBeNull();
    expect(screen!.filePath.toLowerCase().endsWith('.txt')).toBe(true);
    expect(screen!.isTeletext).toBeFalsy();
  });

  test('Conf1/Menu.tti wins for a teletext session', () => {
    const { loadScreenFile } = require('../../src/handlers/screen.handler');
    const screen = loadScreenFile('MENU', 1, 1, { texttvMode: true });
    expect(screen).not.toBeNull();
    expect(screen!.filePath.toLowerCase().endsWith('.tti')).toBe(true);
    expect(screen!.isTeletext).toBe(true);
  });
});
