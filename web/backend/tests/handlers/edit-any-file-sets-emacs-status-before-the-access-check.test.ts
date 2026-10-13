/**
 * Command 4 (express.e:24517-24522, dispatch 28297): setEnvStat(ENV_EMACS) comes BEFORE checkSecurity(ACS_EDIT_FILES); a refusal still leaves the status set.
 * Driven through processBBSCommand. The shell/editor itself (MicroEmacs, AmigaShell) is WEB_ stubbed in sysop-commands.handler.ts.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { setBoardRoot } from '../helpers/board-root';

const board = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'));
setBoardRoot(board);
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/achievements/reporter', () => ({ report: () => undefined }));
jest.mock('../../src/handlers/command-handler/menu', () => ({ displayMainMenu: jest.fn(async () => undefined) }));

/* eslint-disable @typescript-eslint/no-var-requires */
const { processBBSCommand } = require('../../src/handlers/command.handler');
const { setSysopCommandsDependencies } = require('../../src/handlers/commands/sysop-commands.handler');
const { LoggedOnSubState } = require('../../src/constants/bbs-states');
const { EnvStat } = require('../../src/constants/env-codes');
const { ACSPermission } = require('../../src/constants/acs-permissions');
/* eslint-enable @typescript-eslint/no-var-requires */

afterAll(() => fs.rmSync(board, { recursive: true, force: true }));

const setEnvStat = jest.fn();
beforeEach(() => {
  setEnvStat.mockReset();
  setSysopCommandsDependencies({ setEnvStat, db: {} as never });
});

function caller(allowed: boolean) {
  const out: string[] = [];
  const socket: any = { id: 'sc', emit: (_e: string, d: string) => { out.push(String(d)); return true; }, on: () => socket };
  const flags = (allowed ? 'T' : 'F').repeat(100).split('');
  const session: any = {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND, nodeId: 1, currentConf: 1, currentMsgBase: 1, tempData: {},
    user: { id: 1, username: 'caller', secLevel: 255, securityFlags: flags.join(''), confAccess: 'X', expert: 'N' },
  };
  socket.session = session;
  return { socket, session, out };
}

test('4 without file-edit access still sets the editor status, then is refused', async () => {
  const c = caller(false);
  await processBBSCommand(c.socket, c.session, '4', '');
  expect(setEnvStat).toHaveBeenCalledWith(c.session, EnvStat.EMACS);
  expect(c.out.join('')).toMatch(/higher access/i);
});

test('4 with file-edit access sets the editor status and runs the editAnyFile stub', async () => {
  const c = caller(true);
  await processBBSCommand(c.socket, c.session, '4', '');
  expect(setEnvStat).toHaveBeenCalledWith(c.session, EnvStat.EMACS);
  expect(c.out.join('')).toMatch(/Edit Any File/);
});
