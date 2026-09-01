/**
 * Regression test: loadScreenFile searches ONLY the directory express.e reads.
 *
 * express.e:6544-6640 builds ONE path per screen type and returns FALSE when
 * the file is not there:
 *   NODE screens   -> nodeScreenDir (defaults to <bbsLoc>/Node<N>/)
 *   CONF screens   -> confScreenDir (<bbsLoc>/Conf<N>/, Screens/ behind it)
 *   GLOBAL screens -> cmds.bbsLoc, the board root
 *
 * This port used to add three search locations of its own invention -
 * `Node<N> (Fallback)`, `Node<N>/Screens (Fallback)` and `Screens (Fallback)` -
 * plus a non-fallback `Node<N>/Screens/`. They hid four screens that a real
 * Amiga would never have displayed (AWAITSCREEN, BBSTITLE, SCREEN_BULL and the
 * LOGON security variants) because the board's files sat in directories
 * express.e does not read.
 *
 * The test drives loadScreenFile itself, against a fixture board on disk, so a
 * re-introduced fallback fails here rather than in a caller's screen.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let fixtureDir: string;
let loadScreenFile: (
  screenName: string,
  conferenceId?: number,
  nodeId?: number,
  session?: any,
) => { content: string; filePath: string } | null;

function write(relPath: string, content: string): void {
  const abs = path.join(fixtureDir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

/**
 * The loader tries FILENAME.TXT as well as filename.txt, and on a
 * case-insensitive filesystem either spelling matches the same fixture file.
 * The claim under test is the DIRECTORY, so compare paths case-insensitively.
 */
function relative(filePath: string): string {
  return path.relative(fixtureDir, filePath).toLowerCase();
}

function session(secLevel = 20, relConfNum = 3): any {
  return {
    user: { username: 'Tester', secLevel },
    terminalType: 'ansi',
    screenWidth: 80,
    screenHeight: 24,
    petsciiMode: false,
    relConfNum,
    nodeId: 7,
  };
}

beforeAll(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-dirs-'));

  // NODE screen where express.e reads it.
  write('Node7/BBSTITLE.txt', 'node-dir bbstitle\n');
  // NODE screens ONLY in the invented locations.
  write('Node7/Screens/JOIN.txt', 'node-screens join\n');
  write('Screens/LOGOFF.txt', 'global-screens logoff\n');
  // CONF screen where express.e reads it, and one only in global Screens/.
  write('Conf3/MENU.txt', 'conf-dir menu\n');
  write('Screens/FILEHELP.txt', 'global-screens filehelp\n');
  // GLOBAL screen at the board root.
  write('BULL.txt', 'board-root bull\n');

  process.env.BBS_DATA_DIR = fixtureDir;
  process.env.SKIP_DB_INIT = '1';
  jest.resetModules();
  loadScreenFile = require('../../src/handlers/screen.handler').loadScreenFile;
});

afterAll(() => {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

describe('loadScreenFile — express.e directory, no invented fallback', () => {
  test('a NODE screen in Node<N>/ is found there', () => {
    const result = loadScreenFile('BBSTITLE', undefined, 7, session());
    expect(result).not.toBeNull();
    expect(relative(result!.filePath)).toBe(path.join('node7', 'bbstitle.txt'));
  });

  test('a NODE screen that exists ONLY in Node<N>/Screens/ is not found', () => {
    expect(loadScreenFile('JOIN', undefined, 7, session())).toBeNull();
  });

  test('a NODE screen that exists ONLY in the global Screens/ is not found', () => {
    expect(loadScreenFile('LOGOFF', undefined, 7, session())).toBeNull();
  });

  test('a CONF screen in Conf<N>/ is found there', () => {
    const result = loadScreenFile('MENU', 3, 7, session());
    expect(result).not.toBeNull();
    expect(relative(result!.filePath)).toBe(path.join('conf3', 'menu.txt'));
  });

  test('a CONF screen that exists ONLY in the global Screens/ is not found', () => {
    expect(loadScreenFile('FILEHELP', 3, 7, session())).toBeNull();
  });

  test('a GLOBAL screen is read from the board root', () => {
    const result = loadScreenFile('BULL', 3, 7, session());
    expect(result).not.toBeNull();
    expect(relative(result!.filePath)).toBe('bull.txt');
  });
});
