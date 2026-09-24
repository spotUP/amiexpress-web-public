/**
 * A screen file with nothing in it must not win the search, and must not
 * clear the terminal when it is all there is.
 *
 * express.e:6773 - `displayScreen` answers TRUE for any file it could OPEN.
 * A zero-byte file therefore cleared the screen, printed nothing, and left
 * the caller believing the screen had been shown, so the caller paused for a
 * key. The sysop reported it on 2026-09-14 as a blank login screen and a
 * pointless pause, and it took three rounds to find because the file was not
 * corrupt and nothing logged a problem.
 *
 * Worse, resolution takes the FIRST name that is present, walking security
 * levels and then scopes, so a hollow `Logon100.txt` beat the perfectly good
 * `Logon.txt` sitting beside it. That is the case this pins first.
 *
 * Drives the real loader and the real displayScreen on a scratch board, like
 * screen-empty-does-not-home.test.ts beside it.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { displayScreen, loadScreenFile } from '../../src/handlers/screen.handler';
import { clearScreenFor } from '../../src/utils/ansi.util';

const WELCOME = 'WELCOME TO UP ROUGH\r\n';

function makeBoard(files: Record<string, string>): string {
  const board = fs.mkdtempSync(path.join(os.tmpdir(), 'hollow-screen-'));
  for (const [rel, body] of Object.entries(files)) {
    const target = path.join(board, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
  }
  return board;
}

function makeSession(overrides: any = {}): any {
  return {
    user: { username: 'T', secLevel: 100 },
    screenWidth: 80,
    screenHeight: 25,
    nodeId: 1,
    currentConf: 1,
    relConfNum: 1,
    subState: 'READ_COMMAND',
    slowmo: 0,
    slowmoCount: 0,
    ...overrides,
  };
}

function wireOf(socket: any): string {
  return socket.emit.mock.calls
    .filter((c: any[]) => c[0] === 'ansi-output')
    .map((c: any[]) => String(c[1] ?? ''))
    .join('');
}

describe('a hollow screen file', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { config } = require('../../src/config');
  let oldDataDir = '';
  let board = '';

  beforeEach(() => { oldDataDir = config.getConfig().dataDir; });
  afterEach(() => {
    config.set('dataDir', oldDataDir);
    if (board) fs.rmSync(board, { recursive: true, force: true });
    board = '';
  });

  test('does not beat the real screen beside it, even at a higher security level', () => {
    // The exact shape on the live board: the caller is level 100, so
    // `Logon100.txt` is tried before `Logon.txt` - and it was empty.
    board = makeBoard({
      'Node1/Logon100.txt': '',
      'Node1/Logon.txt': WELCOME,
    });
    config.set('dataDir', board);

    const loaded = loadScreenFile('LOGON', 1, 1, makeSession());

    expect(loaded).not.toBeNull();
    expect(loaded!.content).toContain('WELCOME TO UP ROUGH');
    expect(path.basename(loaded!.filePath)).toBe('Logon.txt');
  });

  test('the `~\\n` stub shape loses the same way', () => {
    // What the seeder and the theme editor write. Two bytes, no content.
    board = makeBoard({
      'Node1/Logon100.txt': '~\n',
      'Node1/Logon.txt': WELCOME,
    });
    config.set('dataDir', board);

    const loaded = loadScreenFile('LOGON', 1, 1, makeSession());

    expect(path.basename(loaded!.filePath)).toBe('Logon.txt');
  });

  test('a file that only runs MCI commands is content, and still wins', () => {
    // `~f|\n~SS_...` shows nothing itself but does real work. It is not
    // hollow, and shortening the rule to "shows no text" would eat it.
    const mci = '~f|\n~SS_BBS:Bulletins/bull7.txt';
    board = makeBoard({
      'Node1/Logon100.txt': mci,
      'Node1/Logon.txt': WELCOME,
    });
    config.set('dataDir', board);

    const loaded = loadScreenFile('LOGON', 1, 1, makeSession());

    expect(path.basename(loaded!.filePath)).toBe('Logon100.txt');
  });

  test('still RESOLVES when it is all there is, so nothing reports a missing screen', () => {
    // A sysop who empties a screen means "show nothing here". Answering null
    // would put a CRITICAL in the log and a notification in front of them on
    // every login instead.
    board = makeBoard({ 'Node1/Logon.txt': '' });
    config.set('dataDir', board);

    const loaded = loadScreenFile('LOGON', 1, 1, makeSession());

    expect(loaded).not.toBeNull();
    expect(loaded!.content).toBe('');
    expect(path.basename(loaded!.filePath)).toBe('Logon.txt');
  });

  test('draws nothing at all - not even the clear that wiped the screen', async () => {
    // ONENODE is in SCREENS_REQUIRE_CLEAR, so an empty one used to emit
    // ESC[2J ESC[H and nothing else: the blank screen the sysop reported.
    board = makeBoard({ 'Screens/ONENODE.TXT': '', 'Node1/ONENODE.TXT': '' });
    config.set('dataDir', board);
    const socket: any = { emit: jest.fn(), on: jest.fn(), id: 'hollow' };

    const shown = await displayScreen(socket, makeSession(), 'ONENODE', false);

    // Shown, in the sense the caller needs: the screen exists and is done.
    expect(shown).toBe(true);
    expect(wireOf(socket)).toBe('');
  });

  test('a screen with content still clears and draws', async () => {
    board = makeBoard({ 'Screens/ONENODE.TXT': 'ONE NODE ONLY\r\n', 'Node1/ONENODE.TXT': 'ONE NODE ONLY\r\n' });
    config.set('dataDir', board);
    const socket: any = { emit: jest.fn(), on: jest.fn(), id: 'full' };

    const shown = await displayScreen(socket, makeSession(), 'ONENODE', false);

    expect(shown).toBe(true);
    const wire = wireOf(socket);
    expect(wire).toContain('ONE NODE ONLY');
    expect(wire).toContain(clearScreenFor(makeSession()));
  });
});
