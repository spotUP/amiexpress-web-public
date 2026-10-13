/**
 * X (express.e:26113-26122 internalCommandX):
 *
 *   IF loggedOnUser.expert="X"
 *     aePuts('\b\nExpert mode disabled\b\n'); loggedOnUser.expert:="N"
 *   ELSE
 *     aePuts('\b\nExpert mode enabled\b\n');  loggedOnUser.expert:="X"
 *
 * No security check and no setEnvStat in express.e (none is added). The main
 * loop then redraws the menu only for a non-expert caller (28586, pinned by
 * the menu tests); the port's X calls displayMainMenu, which applies that
 * same gate. The record save is the logoff / W path (8207, 25893), not X.
 *
 * Driven through processBBSCommand (dispatcher of express.e:28289-28397).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { setBoardRoot } from '../helpers/board-root';

const board = fs.mkdtempSync(path.join(os.tmpdir(), 'x-'));
setBoardRoot(board);
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/handlers/screen.handler', () => ({
  ...jest.requireActual('../../src/handlers/screen.handler'),
  doPause: (_s: unknown, _sess: unknown, done: () => void) => done(),
}));
jest.mock('../../src/achievements/reporter', () => ({ report: () => undefined }));
jest.mock('../../src/handlers/command-handler/menu', () => ({ displayMainMenu: jest.fn(async () => undefined) }));

/* eslint-disable @typescript-eslint/no-var-requires */
const { processBBSCommand } = require('../../src/handlers/command.handler');
const { LoggedOnSubState } = require('../../src/constants/bbs-states');
const { flushOutput } = require('../../src/utils/output.util');
/* eslint-enable @typescript-eslint/no-var-requires */

afterAll(() => fs.rmSync(board, { recursive: true, force: true }));

function caller(expert: string) {
  const wire: string[] = [];
  const socket: any = {
    id: `x-${Math.random().toString(36).slice(2)}`,
    emit: (e: string, d: unknown) => { if (e === 'ansi-output') wire.push(String(d)); return true; },
    on: () => socket,
  };
  const session: any = {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND, nodeId: 1, currentConf: 1, currentMsgBase: 1, tempData: {},
    user: { id: 1, username: 'caller', secLevel: 1, securityFlags: 'F'.repeat(100), confAccess: 'X', expert },
  };
  socket.session = session;
  return { socket, session, out: () => { flushOutput(socket); return wire.join(''); } };
}

test('X turns expert mode on and says "Expert mode enabled" for any caller', async () => {
  const c = caller('N');
  await processBBSCommand(c.socket, c.session, 'X', '');
  expect(c.out()).toBe('\r\nExpert mode enabled\r\n');
  expect(c.session.user.expert).toBe('X');
});

test('X turns expert mode off again and says "Expert mode disabled"', async () => {
  const c = caller('X');
  await processBBSCommand(c.socket, c.session, 'X', '');
  expect(c.out()).toBe('\r\nExpert mode disabled\r\n');
  expect(c.session.user.expert).toBe('N');
  await processBBSCommand(c.socket, c.session, 'X', '');
  expect(c.session.user.expert).toBe('X');
});
