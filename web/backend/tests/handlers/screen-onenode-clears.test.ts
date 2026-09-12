/**
 * ONENODE clears before the already-logged-in box.
 *
 * User-visible symptom (sysop screenshot, T mode): the ALREADY LOGGED IN
 * ELSEWHERE box painted over BBSTITLE remnants and the login prompts -
 * "100 UP ROUGH BBS", "ition", "ors." showing around and under the box.
 *
 * Cause: ONENODE is a small centered box, not full-screen art, and it was
 * not in SCREENS_REQUIRE_CLEAR - so displayScreen painted it straight over
 * whatever the caller was looking at. express.e:29715-29727 shows it with
 * no clear; the clear is a sysop-directed WEB_ divergence (see the set).
 *
 * Drives displayScreen on a scratch board (never the checkout: the jest
 * live-data guard forbids reading the checkout as a board). Asserted is
 * the CLEAR (first bytes on the wire), never art bytes.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { displayScreen } from '../../src/handlers/screen.handler';

function makeBoard(): string {
  const board = fs.mkdtempSync(path.join(os.tmpdir(), 'onenode-clear-'));
  const dir = path.join(board, 'Screens');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'ONENODE.TXT'),
    '~WX\nsmall centered box\nsecond row\n',
  );
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

describe('ONENODE clears first', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { config } = require('../../src/config');
  let oldDataDir = '';
  let board = '';

  afterEach(() => {
    config.set('dataDir', oldDataDir);
    if (board) fs.rmSync(board, { recursive: true, force: true });
    board = '';
  });

  test('the already-logged-in box opens on a cleared screen', async () => {
    board = makeBoard();
    oldDataDir = config.getConfig().dataDir;
    config.set('dataDir', board);
    const socket: any = { emit: jest.fn(), on: jest.fn(), id: 'onenode-clear' };
    const session = makeSession({ texttvMode: true, screenWidth: 40, screenHeight: 25 });

    await displayScreen(socket, session, 'ONENODE', false);

    const wire = socket.emit.mock.calls
      .filter((c: any[]) => c[0] === 'ansi-output')
      .map((c: any[]) => String(c[1] ?? ''))
      .join('');
    expect(wire.startsWith('\x1b[2J\x1b[H')).toBe(true);
    expect(wire).toContain('small centered box');
  });
});
