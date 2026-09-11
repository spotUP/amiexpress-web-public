/**
 * Flow screens paginate like express.e.
 *
 * User-visible symptom (sysop, T mode): a multi-screen bulletin scrolled
 * past with no pause at all - one `(Pause)...Space To Resume:` at the very
 * end, nothing mid-content.
 *
 * Cause: displayScreen skipped auto-pagination for flow screens
 * (BULL/NODE_BULL/CONF_BULL/LOGON/MENU...), claiming "a single frame like
 * express.e". express.e shows every screen through displayFile, which
 * pauses per lineCount (flagPause/checkForPause, express.e:28025/5180) -
 * there is no single-frame exemption. Short flow screens never reach
 * pageSize, so enabling the gate changes nothing for MENU or BBSTITLE.
 *
 * These tests drive displayScreen with generated long/short BULL files on
 * a scratch board (never the checkout: the jest live-data guard forbids
 * reading the checkout as a board). What is asserted is the PAGINATION
 * (first page + More prompt + held remainder), never art bytes.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { displayScreen } from '../../src/handlers/screen.handler';

function makeBoard(numLines: number): string {
  const board = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-page-'));
  const dir = path.join(board, 'Screens');
  fs.mkdirSync(dir, { recursive: true });
  const lines = Array.from({ length: numLines }, (_, i) => `bulletin line ${i + 1} of ${numLines}`);
  // No trailing newline: split() would count one extra empty element for it,
  // and the count asserted below must be the input's own line count.
  fs.writeFileSync(path.join(dir, 'BULL.txt'), lines.join('\n'));
  return board;
}

function makeSession(overrides: any = {}): any {
  return {
    user: { username: 'T', secLevel: 100 },
    screenWidth: 80,
    screenHeight: 24,
    nodeId: 1,
    currentConf: 1,
    relConfNum: 1,
    subState: 'READ_COMMAND',
    slowmo: 0,
    slowmoCount: 0,
    ...overrides,
  };
}

describe('flow-screen pagination', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { config } = require('../../src/config');
  let oldDataDir = '';
  let board = '';

  afterEach(() => {
    config.set('dataDir', oldDataDir);
    if (board) fs.rmSync(board, { recursive: true, force: true });
    board = '';
  });

  test('a long BULL paginates in a teletext session', async () => {
    board = makeBoard(60);
    oldDataDir = config.getConfig().dataDir;
    config.set('dataDir', board);
    const socket: any = { emit: jest.fn(), on: jest.fn(), id: 'flow-page-t' };
    const session = makeSession({ texttvMode: true, screenWidth: 40, screenHeight: 25 });

    await displayScreen(socket, session, 'BULL', true, true);

    expect(session.paginatedScreen).toBeDefined();
    // Flow screens get a frame-ending newline appended (displayScreen), so
    // the split counts one trailing empty element past the input's lines.
    expect(session.paginatedScreen.lines.length).toBeGreaterThanOrEqual(60);
    expect(session.paginatedScreen.lines.slice(0, 60).join('\n')).toContain('bulletin line 60 of 60');
    expect(session.paginatedScreen.nextIndex).toBe(24);
    const firstEmit = socket.emit.mock.calls.map((c: any[]) => String(c[1] ?? '')).join('');
    expect(firstEmit).toContain('More(y/n/ns)');
    expect(firstEmit).toContain('bulletin line 1 of 60');
    expect(firstEmit).not.toContain('bulletin line 60 of 60');
  });

  test('a long BULL paginates in an 80-column session too', async () => {
    board = makeBoard(60);
    oldDataDir = config.getConfig().dataDir;
    config.set('dataDir', board);
    const socket: any = { emit: jest.fn(), on: jest.fn(), id: 'flow-page-80' };
    const session = makeSession({ texttvMode: false, petsciiMode: false, screenWidth: 80, screenHeight: 24 });

    await displayScreen(socket, session, 'BULL', true, true);

    expect(session.paginatedScreen).toBeDefined();
    expect(session.paginatedScreen.nextIndex).toBe(23);
    const firstEmit = socket.emit.mock.calls.map((c: any[]) => String(c[1] ?? '')).join('');
    expect(firstEmit).toContain('More(y/n/ns)');
  });

  test('a short BULL still shows whole with no pagination', async () => {
    board = makeBoard(10);
    oldDataDir = config.getConfig().dataDir;
    config.set('dataDir', board);
    const socket: any = { emit: jest.fn(), on: jest.fn(), id: 'flow-page-short' };
    const session = makeSession({ texttvMode: true, screenWidth: 40, screenHeight: 25 });

    await displayScreen(socket, session, 'BULL', true, true);

    expect(session.paginatedScreen).toBeUndefined();
    const firstEmit = socket.emit.mock.calls.map((c: any[]) => String(c[1] ?? '')).join('');
    expect(firstEmit).not.toContain('More(y/n/ns)');
    expect(firstEmit).toContain('bulletin line 10 of 10');
  });
});
