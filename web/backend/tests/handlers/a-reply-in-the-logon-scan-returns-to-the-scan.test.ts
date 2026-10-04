/**
 * A reply saved from the logon scan goes back into the scan, and the scan
 * finishes into the menu.
 *
 * The sysop, 2026-09-30: "Msg. Options: A,C,D,E,L,S,? >:s / Saving...Message
 * Number 3...done! / stuck here". The logon scan was a state machine resumed
 * from key handlers; the reply left it, ended at the menu, and inConfScan
 * stayed set, so the menu was suppressed for the rest of the call. express.e's
 * confScan (28066-28150) is one procedure: replyPrompt returns into
 * searchNewMail, the next conference is scanned, and confScan returns.
 *
 * Driven through handleCommand from the CONF_SCAN step of the logon display
 * flow, over a real HeaderFile / MailStats / body files.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn(async () => false),
  doPause: jest.fn(),
  checkScreenClear: jest.fn(),
  runQueuedScreenCommands: jest.fn(async () => {}),
  continueAfterScreen: jest.fn(async (_s: any, _se: any, next: () => unknown) => { await next(); return false; }),
}));
// The X case's upload: no partials to resume, nothing to sweep, and an rz
// whose receive the test delivers.
jest.mock('../../src/services/resume-stuff.service', () => ({
  startResumeStuff: (_s: unknown, _se: unknown, _p: unknown, _c: unknown, done: (r: unknown) => void) => done({ resumed: 0 }),
}));
jest.mock('../../src/utils/clean-playpen.util', () => ({ cleanPlayPen: jest.fn(async () => undefined) }));
const lrzszManagers: any[] = [];
jest.mock('../../src/services/lrzsz-transfer.service', () => ({
  isLrzszAvailable: () => true,
  LrzszTransferManager: class {
    opts: any;
    constructor(opts: any) { this.opts = opts; lrzszManagers.push(this); }
    start() { /* the test delivers the receive */ }
    handleInput() { /* no rz */ }
  },
}));
jest.mock('../../src/utils/conference-tooltypes.util', () => ({
  getConferenceToolFlags: () => ({
    custom: false, forceNewscan: false, noNewscan: false, showNewFiles: false,
    noNewFiles: false, forceMenus: false, noBulls: false, noConfBulls: false,
  }),
}));
jest.mock('../../src/utils/message-pointers.util', () => ({
  getMailStatFile: jest.fn(() => ({ lowestKey: 1, highMsgNum: 3, lowestNotDel: 1 })),
  loadMsgPointers: jest.fn(async () => ({ lastNewReadConf: 0, lastMsgReadConf: 0, scanFlags: 0xff })),
  saveMsgPointers: jest.fn(async () => {}),
  validatePointers: jest.fn((p: any) => p),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../src/config';
import { messageIndexManager, MsgStatus } from '../../src/services/MessageIndexManager';
import {
  setConferences, setMessageBases, setHelpers, setConstants,
} from '../../src/handlers/operations/conference.handler';
import { setMessageScanDependencies } from '../../src/handlers/message/message-scan.handler';
import { handleCommand, advanceDisplayFlow } from '../../src/handlers/command.handler';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { setMessageEntryDependencies } from '../../src/handlers/message/message-entry.handler';
import { setFileAreas, displayUploadInterface } from '../../src/handlers/file/file.handler';
import { setUserCommandsDependencies } from '../../src/handlers/commands/user-commands.handler';
import { BBSPaths } from '../../src/utils/bbs-paths.util';

let root = '';
const realGet = config.get.bind(config);
jest.spyOn(config, 'get').mockImplementation(((key: string) => (key === 'dataDir' ? root : realGet(key as any))) as any);

// A fresh board for each case: one unread private message to spot.
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'logon-scan-reply-'));
  process.env.BBS_DATA_DIR = root;
  messageIndexManager.setBbsRoot(root);
  messageIndexManager.initializeMessageIndex(1);
  messageIndexManager.appendMessageHeader(1, {
    status: MsgStatus.PRIVATE, msgNumb: 1, toName: 'spot', fromName: 'Alice', subject: 'hi',
    msgDate: 1_700_000_000, recv: 0, extMsgNum: 0,
  });
  fs.writeFileSync(path.join(root, 'Conf1', 'MsgBase', '1'), 'hello spot\n', 'latin1');
  const conferences = [{ id: 1, name: 'General' }];
  const bases = [{ id: 1, conferenceId: 1, name: 'Main' }];
  setConferences(conferences as any);
  setMessageBases(bases as any);
  setMessageScanDependencies(null, null, null, null, null, conferences, bases);
  setConstants({ SCREEN_BULL: 'BULL', SCREEN_NODE_BULL: 'NODE_BULL', SCREEN_CONF_BULL: 'CONF_BULL', LoggedOnSubState } as any);
  setMessageEntryDependencies({ db: { createMessage: async () => 3, updateUser: async () => {} }, callersLog: async () => {} });
  setHelpers({ callersLog: async () => {}, loadFlagged: async () => {}, loadHistory: async () => {} } as any);
  setFileAreas([{ id: 1, conferenceId: 1, name: 'Uploads' }]);
  setUserCommandsDependencies({ displayScreen: async () => false, displayUploadInterface } as any);
});

describe('a reply from the logon scan', () => {
  it('returns into the scan, and the scan finishes into the menu', async () => {
    const out: string[] = [];
    const socket: any = { id: `ls-${Math.random()}`, emit: (_e: string, t: any) => out.push(String(t)), on() {}, off() {}, removeListener() {} };
    const session: any = {
      state: 'loggedon', subState: LoggedOnSubState.CONF_SCAN, nodeId: 1, currentConf: 1, relConfNum: 1,
      user: { id: 1, username: 'spot', name: 'spot', secLevel: 255, securityFlags: '', confAccess: 'X' }, tempData: {},
    };
    const settle = () => new Promise((r) => setTimeout(r, 60));
    const type = async (keys: string[]) => {
      for (const k of keys) {
        await handleCommand(socket, session, k);
        await settle();
      }
    };

    const flow = advanceDisplayFlow(socket, session);
    await settle();
    expect(out.join('')).toContain('Would you like to read it now');

    // Y reads it, R replies, the subject is kept, the editor saves.
    await type(['y']);
    await type(['r', '\r']);
    await type(['\r']);
    await type(['n', 'reply text', '\r', '\r', 's', '\r']);
    expect(out.join('')).toContain('done!');

    // Back in the reader for the next message: none left, so Enter walks on.
    await type(['\r']);
    await flow;

    expect(out.join('').split('Scanning conferences for mail').length - 1).toBe(1);
    expect(session.inConfScan).toBeFalsy();
    expect(session.subState).not.toBe(LoggedOnSubState.CONF_SCAN);
  });

  it('a reply saved with X uploads its files into the message, then returns into the scan', async () => {
    lrzszManagers.length = 0;
    const out: string[] = [];
    const socket: any = { id: `ls-${Math.random()}`, emit: (_e: string, t: any) => out.push(String(t)), on() {}, off() {}, once() {}, removeListener() {} };
    const session: any = {
      state: 'loggedon', subState: LoggedOnSubState.CONF_SCAN, nodeId: 1, currentConf: 1, relConfNum: 1,
      connectionType: 'telnet', transferRawSend: () => undefined, bbsPath: root,
      // ACS_PUB_MSGFILES among them: X is offered on a public reply (express.e:10378).
      user: { id: 1, username: 'spot', name: 'spot', secLevel: 255, securityFlags: 'T'.repeat(100), confAccess: 'X' }, tempData: {},
    };
    const settle = () => new Promise((r) => setTimeout(r, 60));
    const type = async (keys: string[]) => {
      for (const k of keys) {
        await handleCommand(socket, session, k);
        await settle();
      }
    };

    const flow = advanceDisplayFlow(socket, session);
    await settle();
    expect(out.join('')).toContain('Would you like to read it now');

    // Y reads it, R replies, the subject is kept; X saves and uploads.
    await type(['y']);
    await type(['r', '\r']);
    await type(['\r']);
    await type(['n', 'reply text', '\r', '\r', 'x', '\r']);
    for (let i = 0; i < 50 && !out.join('').includes('FileName 1:'); i++) await settle();
    expect(out.join('')).toContain('done!');
    expect(out.join('')).toContain('FileName 1:');

    // FileName 1: blank, Okay: Enter, the receive, a description.
    await type(['\r']);
    await type(['\r']);
    expect(lrzszManagers).toHaveLength(1);
    const playpen = new BBSPaths(root).node(1).playpen();
    fs.mkdirSync(playpen, { recursive: true });
    fs.writeFileSync(path.join(playpen, 'REPLY.LHA'), 'LHA');
    await lrzszManagers[0].opts.onComplete(true, { received: [path.join(playpen, 'REPLY.LHA')], skipped: [] });
    await settle();
    await type(['for you', '\r', '\r']);

    const msgBase = path.join(root, 'Conf1', 'MsgBase');
    const fDirs = fs.readdirSync(msgBase).filter((d) => /^F\d+$/.test(d));
    expect(fDirs).toHaveLength(1);
    expect(fs.readdirSync(path.join(msgBase, fDirs[0])).sort()).toEqual(['REPLY.LHA', 'REPLY.LHA.dis']);

    // Back in the reader for the next message: none left, so Enter walks on.
    await type(['\r']);
    await flow;

    expect(out.join('').split('Scanning conferences for mail').length - 1).toBe(1);
    expect(session.inConfScan).toBeFalsy();
    expect(session.subState).not.toBe(LoggedOnSubState.CONF_SCAN);
    expect(session.uploadReturn).toBeUndefined();
  });
});
