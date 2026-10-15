// @ts-nocheck
/**
 * E, typed at the menu, looks its recipient up in the board's accounts
 * (express.e enterMSG 10822 chooseAName) - the reachability test for
 * msg-names.ts through handleCommand.
 *
 * Before the port, E accepted any name typed at To: and filed the message to
 * a user who does not exist; express.e says "User does not exist!!" and ends
 * the command.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

process.env.SKIP_DB_INIT = '1';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'e-names-'));
process.env.BBS_DATA_DIR = root;
process.env.BBS_ROOT = root;
// The board's modules were loaded against the worker's board by the setup.
jest.resetModules();

const { UserFileManager } = require('../../../src/services/UserFileManager');
const { handleCommand } = require('../../../src/handlers/command.handler');
const { setMessagingDependencies } = require('../../../src/handlers/message/messaging.handler');
const { flushOutput } = require('../../../src/utils/output.util');
const { LoggedOnSubState, BBSState } = require('../../../src/constants/bbs-states');

beforeAll(() => {
  const writer = new UserFileManager();
  for (const [slot, name] of [[1, 'Spot'], [2, 'Alice']] as const) {
    writer.writeUserFiles({ username: name, realname: '' }, slot);
  }
  setMessagingDependencies({ setEnvStat: () => undefined });
});

function aCaller() {
  const out: string[] = [];
  const socket: any = {
    id: `e-names-${Math.random().toString(36).slice(2)}`,
    connected: true,
    emit: (event: string, data: unknown) => { if (event === 'ansi-output' && typeof data === 'string') out.push(data); },
    on: () => {},
  };
  const session: any = {
    nodeId: 1, state: BBSState.LOGGEDON, subState: LoggedOnSubState.READ_COMMAND,
    skipNextDisplayFlowMenu: true, manualMenuTargetState: LoggedOnSubState.READ_COMMAND,
    currentConf: 1, currentMsgBase: 1, relConfNum: 1, currentConfName: 'Main', timeRemaining: 3600,
    tempData: {}, commandHistory: [], historyIndex: 0,
    user: { id: 'u9', username: 'Poster', secLevel: 255, expert: 'X', confAccess: 'X', securityFlags: 'T'.repeat(100) },
  };
  const type = async (keys: string) => {
    for (const k of keys) await handleCommand(socket, session, k);
    await new Promise((r) => setTimeout(r, 60));
    flushOutput(socket);
  };
  return { socket, session, out, type };
}

describe('E at the menu', () => {
  it('to a name nobody on the board has: "User does not exist!!" and back to the menu', async () => {
    const c = aCaller();
    await c.type('E\r');
    await c.type('Nobody\r');
    const wire = c.out.join('');
    const refusal = wire.indexOf('\r\nUser does not exist!!\r\n\r\n');
    expect(refusal).toBeGreaterThan(wire.indexOf('Nobody'));
    expect(wire).not.toContain('Subject');
    expect(wire.slice(refusal)).toMatch(/Menu \(/);
  });

  it('to a name on the board: addressed as the account spells it', async () => {
    const c = aCaller();
    await c.type('E\r');
    await c.type('alice\r');
    expect(c.out.join('')).toContain('Subject');
    expect(c.session.tempData.messageEntry.toUser).toBe('Alice');
    expect(c.session.tempData.messageEntry.toSlot).toBe(2);
  });
});
