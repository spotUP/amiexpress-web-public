/**
 * J into a conference with new mail: express.e's searchNewMail with
 * currentConf<>0 (11667-11760) prints "Found Mail!" and asks "Would you like
 * to read it now", and Y reads each message with replyPrompt after it. The
 * port printed the scan table - the logon scan's form - and returned, so the
 * caller saw a list he could not read from (audit M1).
 *
 * Driven through joinConference, with the real searchNewMail over a real
 * HeaderFile / MailStats / body files; only the screen and the pointer
 * store are replaced.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn(async () => false),
  doPause: jest.fn(),
  checkScreenClear: jest.fn(),
  runQueuedScreenCommands: jest.fn(async () => {}),
}));
jest.mock('../../src/utils/conference-tooltypes.util', () => ({
  getConferenceToolFlags: () => ({
    custom: false, forceNewscan: false, noNewscan: false, showNewFiles: false,
    noNewFiles: false, forceMenus: false, noBulls: false, noConfBulls: false,
  }),
}));
jest.mock('../../src/utils/message-pointers.util', () => ({
  loadConferenceAccount: jest.fn(),
  saveConferenceAccount: jest.fn(),
  getMailStatFile: jest.fn(() => ({ lowestKey: 1, highMsgNum: 3, lowestNotDel: 1 })),
  loadMsgPointers: jest.fn(async () => ({ lastNewReadConf: 0, lastMsgReadConf: 0, scanFlags: 0 })),
  saveMsgPointers: jest.fn(async () => {}),
  validatePointers: jest.fn((p: any) => p),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../src/config';
import { messageIndexManager, MsgStatus } from '../../src/services/MessageIndexManager';
import {
  joinConference, FORCE_MAILSCAN_ALL, setConferences, setMessageBases, setHelpers, setConstants,
} from '../../src/handlers/operations/conference.handler';
import { handleCommand } from '../../src/handlers/command.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'join-scan-'));
const realGet = config.get.bind(config);
jest.spyOn(config, 'get').mockImplementation(((key: string) => (key === 'dataDir' ? root : realGet(key as any))) as any);

beforeAll(() => {
  process.env.BBS_DATA_DIR = root;
  messageIndexManager.setBbsRoot(root);
  messageIndexManager.initializeMessageIndex(1);
  for (const [n, to, body] of [[1, 'someone', 'not mine'], [2, 'spot', 'hello spot']] as const) {
    messageIndexManager.appendMessageHeader(1, {
      status: MsgStatus.PRIVATE, msgNumb: n, toName: to, fromName: 'Alice', subject: `s${n}`,
      msgDate: 1_700_000_000, recv: 0, extMsgNum: 0,
    });
    fs.writeFileSync(path.join(root, 'Conf1', 'MsgBase', String(n)), `${body}\n`, 'latin1');
  }
  setConferences([{ id: 1, name: 'General' }] as any);
  setMessageBases([{ id: 1, conferenceId: 1, name: 'Main' }] as any);
  setConstants({ SCREEN_BULL: 'BULL', SCREEN_NODE_BULL: 'NODE_BULL', SCREEN_CONF_BULL: 'CONF_BULL', LoggedOnSubState } as any);
  setHelpers({ callersLog: async () => {}, loadFlagged: async () => {}, loadHistory: async () => {} } as any);
});

describe('J into a conference with new mail', () => {
  it('says Found Mail!, offers to read it, and Y shows it with the scan reader\'s prompt', async () => {
    const out: string[] = [];
    const socket: any = { id: `js-${Math.random()}`, emit: (_e: string, t: any) => out.push(String(t)), on() {}, off() {}, removeListener() {} };
    const session: any = {
      state: 'loggedon', subState: LoggedOnSubState.READ_COMMAND, nodeId: 1, currentConf: 1, relConfNum: 1,
      user: { id: 1, username: 'spot', name: 'spot', secLevel: 20, securityFlags: '', confAccess: 'X' }, tempData: {},
    };
    const settle = () => new Promise((r) => setTimeout(r, 40));

    const joined = joinConference(socket, session, 1, 1, true, false, FORCE_MAILSCAN_ALL);
    await settle();
    const asked = out.join('');
    expect(asked).toContain('\r\nFound Mail!\r\nWould you like to read it now ');
    expect(asked).not.toContain('Type     From');

    out.length = 0;
    await handleCommand(socket, session, 'y');
    await settle();
    const read = out.join('');
    expect(read).toContain('hello spot');
    expect(read).not.toContain('not mine');
    expect(read).toContain('\x1b[32m(\x1b[0m 2\x1b[32m )\x1b[0m >: ');

    await handleCommand(socket, session, 'q');
    await handleCommand(socket, session, '\r');
    await joined;
  });
});
