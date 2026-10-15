/**
 * An empty screen does not move the cursor.
 *
 * Logon.ttx and Logon.txt are both `~\n` on this board: deliberately empty,
 * deliberately still screens. Shown with slow mode on they were streamed
 * anyway, and the stream wraps its content in HIDE_CURSOR + ESC[H - so for a
 * screen with no content that is ALL it did: home the cursor. The Username
 * prompt printed right afterwards then landed on top of the title screen
 * that had just been drawn (sysop, teletext walk, 2026-09-13: "the prompt is
 * there as well it should be at the bottom").
 *
 * Drives displayScreen on a scratch board, like the ONENODE test beside it.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { displayScreen } from '../../src/handlers/screen.handler';

function makeBoard(files: Record<string, string>): string {
  const board = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-screen-'));
  // A node reads its own directory first and the shared one after
  // (ACP.e:2666-2673), so the fixture lives in both.
  for (const dir of [path.join(board, 'Screens'), path.join(board, 'Node1')]) {
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), body);
    }
  }
  return board;
}

function makeSession(overrides: any = {}): any {
  return {
    user: { username: 'T', secLevel: 100 },
    screenWidth: 40,
    screenHeight: 25,
    nodeId: 1,
    currentConf: 1,
    relConfNum: 1,
    subState: 'READ_COMMAND',
    slowmo: 0,
    slowmoCount: 0,
    texttvMode: true,
    ...overrides,
  };
}

function wireOf(socket: any): string {
  return socket.emit.mock.calls
    .filter((c: any[]) => c[0] === 'ansi-output')
    .map((c: any[]) => String(c[1] ?? ''))
    .join('');
}

describe('a screen with nothing in it', () => {
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

  test('writes nothing at all - no stream, no cursor moves', async () => {
    // `~\n` is what Logon.ttx and Logon.txt are on this board: MCI enabled,
    // content empty. Slow mode on, because that is what wraps a screen in
    // HIDE_CURSOR + ESC[H, and for an empty screen those moves were the only
    // thing it emitted.
    board = makeBoard({ 'ONENODE.TXT': '~\n' });
    config.set('dataDir', board);
    const socket: any = { emit: jest.fn(), on: jest.fn(), id: 'empty-screen' };

    await displayScreen(socket, makeSession({ slowmo: 1 }), 'ONENODE', false);

    // ONENODE clears before it draws (screen-onenode-clears.test.ts), and
    // that clear carries its own home - it is the STREAM's moves this is
    // about, so the clear comes off first.
    const wire = wireOf(socket).replace('\x1b[2J\x1b[H', '');
    expect(wire).not.toContain('\x1b[?25l');   // the stream's own hide-cursor
    expect(wire).not.toContain('\x1b[H');      // and the home that moved the prompt
  });

  test('a screen with content is still streamed, cursor moves and all', async () => {
    board = makeBoard({ 'ONENODE.TXT': '~WX\nUP ROUGH BBS\n' });
    config.set('dataDir', board);
    const socket: any = { emit: jest.fn(), on: jest.fn(), id: 'full-screen' };

    await displayScreen(socket, makeSession({ slowmo: 1 }), 'ONENODE', false);

    const wire = wireOf(socket);
    expect(wire).toContain('UP ROUGH BBS');
    expect(wire).toContain('\x1b[?25l');
    expect(wire).toContain('\x1b[H');
  });
});
