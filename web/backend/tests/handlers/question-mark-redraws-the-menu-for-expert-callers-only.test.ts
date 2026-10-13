/**
 * ? (express.e:24594-24600 internalCommandQuestionMark, dispatch 28393):
 *   IF loggedOnUser.expert="X" THEN checkScreenClear(); displayScreen(SCREEN_MENU)
 * A non-expert caller gets nothing from the command itself (the main loop draws the menu).
 * Kept web-only: the non-expert branch resets menuPause and the sub-state so the loop redraws.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { setBoardRoot } from '../helpers/board-root';

const board = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-'));
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
const { displayMainMenu } = require('../../src/handlers/command-handler/menu');
const { LoggedOnSubState } = require('../../src/constants/bbs-states');
/* eslint-enable @typescript-eslint/no-var-requires */

afterAll(() => fs.rmSync(board, { recursive: true, force: true }));
beforeEach(() => (displayMainMenu as jest.Mock).mockClear());

function caller(expert: string) {
  const socket: any = { id: 'qm', emit: () => true, on: () => socket };
  const session: any = {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND, nodeId: 1, currentConf: 1, currentMsgBase: 1, tempData: {},
    user: { id: 1, username: 'caller', secLevel: 1, securityFlags: 'F'.repeat(100), confAccess: 'X', expert },
  };
  socket.session = session;
  return { socket, session };
}

test('? draws the menu for an expert caller', async () => {
  const c = caller('X');
  await processBBSCommand(c.socket, c.session, '?', '');
  expect(displayMainMenu).toHaveBeenCalledTimes(1);
  expect(displayMainMenu).toHaveBeenCalledWith(c.socket, c.session, true);
});

test('? draws nothing for a non-expert caller', async () => {
  const c = caller('N');
  await processBBSCommand(c.socket, c.session, '?', '');
  expect(displayMainMenu).not.toHaveBeenCalled();
});
