/**
 * The logon scan's table (express.e searchNewMail, currentConf=0, 11667-11760):
 * the conference is named once, at message base 1, each base the board named
 * is named on its own line, mail already received is not listed, and a
 * pointer past the end of rebuilt stats starts over at the lowest message.
 *
 * Replaces the tests of the old scan walk (message-scan.handler's
 * scanConferenceForNewMail), whose behaviours now live here.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../../src/utils/message-pointers.util', () => ({
  loadConferenceAccount: jest.fn(),
  saveConferenceAccount: jest.fn(),
  getMailStatFile: jest.fn(() => ({ lowestKey: 1, highMsgNum: 4, lowestNotDel: 1 })),
  loadMsgPointers: jest.fn(async () => ({ lastNewReadConf: 0, lastMsgReadConf: 0, scanFlags: 0xff })),
  saveMsgPointers: jest.fn(async () => {}),
  validatePointers: jest.fn((p: any) => p),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../../src/config';
import { messageIndexManager, MsgStatus } from '../../../src/services/MessageIndexManager';
import { searchNewMail } from '../../../src/handlers/message/read-msg';
import { handleCommand } from '../../../src/handlers/command.handler';
import { LoggedOnSubState } from '../../../src/constants/bbs-states';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'logon-scan-table-'));
const realGet = config.get.bind(config);
jest.spyOn(config, 'get').mockImplementation(((key: string) => (key === 'dataDir' ? root : realGet(key as any))) as any);

beforeAll(() => {
  process.env.BBS_DATA_DIR = root;
  messageIndexManager.setBbsRoot(root);
  messageIndexManager.initializeMessageIndex(1);
  const mail = [
    [1, 'spot', 1_700_000_500, 'already read'],
    [2, 'someone', 0, 'not mine'],
    [3, 'spot', 0, 'unread'],
  ] as const;
  for (const [n, to, recv, subject] of mail) {
    messageIndexManager.appendMessageHeader(1, {
      status: MsgStatus.PRIVATE, msgNumb: n, toName: to, fromName: 'Alice', subject,
      msgDate: 1_700_000_000, recv, extMsgNum: 0,
    });
    fs.writeFileSync(path.join(root, 'Conf1', 'MsgBase', String(n)), `${subject}\n`, 'latin1');
  }
});

function caller(lastNewReadConf: number) {
  const out: string[] = [];
  const socket: any = { id: `lt-${Math.random()}`, emit: (_e: string, t: any) => out.push(String(t)), on() {}, off() {}, removeListener() {} };
  const session: any = {
    state: 'loggedon', subState: LoggedOnSubState.CONF_SCAN, nodeId: 1, currentConf: 0, lastNewReadConf,
    user: { id: 1, username: 'spot', name: 'spot', secLevel: 20, securityFlags: '', confAccess: 'X' }, tempData: {},
  };
  const plain = () => out.join('').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  return { socket, session, plain };
}

async function scanAndDecline(c: ReturnType<typeof caller>, scanning: any) {
  const done = searchNewMail(c.socket, c.session, 1, 1, scanning);
  await new Promise((r) => setTimeout(r, 40));
  await handleCommand(c.socket, c.session, 'n');
  await done;
}

describe('the logon scan table', () => {
  it('lists unread mail to the caller only, not mail already received', async () => {
    const c = caller(0);
    await scanAndDecline(c, { confName: 'General', msgBaseName: '', msgBaseNum: 1 });
    const text = c.plain();
    expect(text).toContain('Scanning Conference: General - ');
    expect(text).toMatch(/Private  Alice\s+unread\s+000003/);
    expect(text).not.toContain('already read');
    expect(text).not.toContain('not mine');
    expect(text).toContain('Would you like to read it now');
  });

  it('names the conference once, at base 1, and each named base on its own', async () => {
    const first = caller(4);
    await searchNewMail(first.socket, first.session, 1, 1, { confName: 'General', msgBaseName: 'Main', msgBaseNum: 1 });
    const second = caller(4);
    await searchNewMail(second.socket, second.session, 1, 1, { confName: 'General', msgBaseName: 'Elite', msgBaseNum: 2 });
    await new Promise((r) => setTimeout(r, 40)); // the output buffer
    expect(first.plain()).toBe('\rScanning Conference: General - \r\n Message Base: Main - No mail today!\r\n');
    expect(second.plain()).toBe(' Message Base: Elite - No mail today!\r\n');
  });

  it('starts a pointer beyond rebuilt stats over at the lowest message', async () => {
    const c = caller(900);
    await scanAndDecline(c, { confName: 'General', msgBaseName: '', msgBaseNum: 1 });
    expect(c.plain()).toMatch(/unread\s+000003/);
  });
});
