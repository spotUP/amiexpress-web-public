/**
 * >> (express.e:24580-24593 internalCommandGT2, dispatch 28329): newMsgBase:=currentMsgBase+1;
 * IF newMsgBase>getConfMsgBaseCount(currentConf) internalCommandJM('') ELSE joinConf(...).
 * Driven through processBBSCommand. The JM fall-back must be awaited.
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

const mockJm = jest.fn();
jest.mock('../../src/handlers/message/message-commands.handler', () => ({
  ...jest.requireActual('../../src/handlers/message/message-commands.handler'),
  handleJoinMessageBaseCommand: (...a: unknown[]) => mockJm(...a),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { processBBSCommand } = require('../../src/handlers/command.handler');
const { setNavigationCommandsDependencies } = require('../../src/handlers/commands/navigation-commands.handler');
const { LoggedOnSubState } = require('../../src/constants/bbs-states');
/* eslint-enable @typescript-eslint/no-var-requires */

afterAll(() => fs.rmSync(board, { recursive: true, force: true }));

const joinConference = jest.fn(async () => true);
beforeEach(() => {
  joinConference.mockClear();
  mockJm.mockReset();
  setNavigationCommandsDependencies({
    conferences: [{ id: 1, name: 'One' }],
    messageBases: [
      { id: 10, name: 'A', conferenceId: 1 }, { id: 11, name: 'B', conferenceId: 1 }, { id: 12, name: 'C', conferenceId: 1 },
      { id: 20, name: 'Other', conferenceId: 2 },
    ],
    joinConference, checkConfAccess: () => true, displayNewFiles: async () => undefined,
  });
});

function caller(msgBase: number) {
  const socket: any = { id: 'gt2', emit: () => true, on: () => socket };
  const session: any = {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND, nodeId: 1, currentConf: 1, currentMsgBase: msgBase, tempData: {},
    user: { id: 1, username: 'caller', secLevel: 1, securityFlags: 'F'.repeat(100), confAccess: 'X', expert: 'N' },
  };
  socket.session = session;
  return { socket, session };
}

test('>> joins the message base after the current one in the same conference', async () => {
  const c = caller(10);
  await processBBSCommand(c.socket, c.session, '>>', '');
  expect(joinConference).toHaveBeenCalledWith(c.socket, c.session, 1, 11);
  expect(mockJm).not.toHaveBeenCalled();
});

test('>> on the last message base runs JM and the command waits for it', async () => {
  const c = caller(12);
  let jmDone = false;
  mockJm.mockImplementation(async () => { await new Promise((r) => setTimeout(r, 10)); jmDone = true; });
  await processBBSCommand(c.socket, c.session, '>>', '');
  expect(joinConference).not.toHaveBeenCalled();
  expect(mockJm).toHaveBeenCalledWith(c.socket, c.session, '');
  expect(jmDone).toBe(true);
});
