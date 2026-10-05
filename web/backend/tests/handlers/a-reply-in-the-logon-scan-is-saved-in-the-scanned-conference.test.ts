/**
 * A reply made from the logon mail scan is saved in the conference being
 * scanned, not in conference 1.
 *
 * confScan (express.e:28103) runs with currentConf:=0. joinConf with
 * confScan=TRUE leaves currentConf alone (4997-5000) but still points
 * msgBaseLocation at the scanned base (5015, getMsgBaseLocation), and
 * saveNewMSG writes the reply to `<msgBaseLocation><msgNumb>` (10694), its
 * X files to `<msgBaseLocation>F<msgNumb>` (10722). The board filed every
 * message under `session.currentConf || 1`, so a reply found in conference 2
 * landed in conference 1.
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
  loadConferenceAccount: jest.fn(),
  saveConferenceAccount: jest.fn(),
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

// Two conferences; the one unread message to spot is in conference 2.
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'logon-scan-reply-conf-'));
  process.env.BBS_DATA_DIR = root;
  messageIndexManager.setBbsRoot(root);
  messageIndexManager.initializeMessageIndex(1);
  messageIndexManager.initializeMessageIndex(2);
  messageIndexManager.appendMessageHeader(2, {
    status: MsgStatus.PRIVATE, msgNumb: 1, toName: 'spot', fromName: 'Alice', subject: 'hi',
    msgDate: 1_700_000_000, recv: 0, extMsgNum: 0,
  });
  fs.writeFileSync(path.join(root, 'Conf2', 'MsgBase', '1'), 'hello spot\n', 'latin1');
  const conferences = [{ id: 1, name: 'General' }, { id: 2, name: 'Amiga' }];
  const bases = [{ id: 1, conferenceId: 1, name: 'Main' }, { id: 2, conferenceId: 2, name: 'Main' }];
  setConferences(conferences as any);
  setMessageBases(bases as any);
  setMessageScanDependencies(null, null, null, null, null, conferences, bases);
  setConstants({ SCREEN_BULL: 'BULL', SCREEN_NODE_BULL: 'NODE_BULL', SCREEN_CONF_BULL: 'CONF_BULL', LoggedOnSubState } as any);
  setMessageEntryDependencies({ db: { createMessage: async () => 3, updateUser: async () => {} }, callersLog: async () => {} });
  setHelpers({ callersLog: async () => {}, loadFlagged: async () => {}, loadHistory: async () => {} } as any);
  setFileAreas([{ id: 1, conferenceId: 1, name: 'Uploads' }, { id: 2, conferenceId: 2, name: 'Uploads' }]);
  setUserCommandsDependencies({ displayScreen: async () => false, displayUploadInterface } as any);
});

function caller(out: string[]) {
  const socket: any = { id: `lsc-${Math.random()}`, emit: (_e: string, t: any) => out.push(String(t)), on() {}, off() {}, once() {}, removeListener() {} };
  const session: any = {
    state: 'loggedon', subState: LoggedOnSubState.CONF_SCAN, nodeId: 1, currentConf: 1, relConfNum: 1,
    connectionType: 'telnet', transferRawSend: () => undefined, bbsPath: root,
    user: { id: 1, username: 'spot', name: 'spot', secLevel: 255, securityFlags: 'T'.repeat(100), confAccess: 'XX' }, tempData: {},
  };
  const settle = () => new Promise((r) => setTimeout(r, 60));
  const type = async (keys: string[]) => {
    for (const k of keys) {
      await handleCommand(socket, session, k);
      await settle();
    }
  };
  return { socket, session, settle, type };
}

const bodyFiles = (conf: number) =>
  fs.readdirSync(path.join(root, `Conf${conf}`, 'MsgBase')).filter((f) => /^\d+$/.test(f)).sort();

describe('a reply from the logon scan', () => {
  it('is saved in the conference whose mail is being read', async () => {
    const out: string[] = [];
    const { socket, session, settle, type } = caller(out);

    const flow = advanceDisplayFlow(socket, session);
    await settle();
    expect(out.join('')).toContain('Would you like to read it now');

    await type(['y']);
    await type(['r', '\r']);
    await type(['\r']);
    await type(['n', 'reply text', '\r', '\r', 's', '\r']);
    expect(out.join('')).toContain('done!');

    await type(['\r']);
    await flow;

    // The reply is message 2 of conference 2; conference 1 has no messages.
    expect(bodyFiles(2)).toEqual(['1', '2']);
    expect(bodyFiles(1)).toEqual([]);
  });

  it('saved with X, uploads its files into the reply in the scanned conference', async () => {
    lrzszManagers.length = 0;
    const out: string[] = [];
    const { socket, session, settle, type } = caller(out);

    const flow = advanceDisplayFlow(socket, session);
    await settle();
    await type(['y']);
    await type(['r', '\r']);
    await type(['\r']);
    await type(['n', 'reply text', '\r', '\r', 'x', '\r']);
    for (let i = 0; i < 50 && !out.join('').includes('FileName 1:'); i++) await settle();
    expect(out.join('')).toContain('FileName 1:');

    await type(['\r']);
    await type(['\r']);
    expect(lrzszManagers).toHaveLength(1);
    const playpen = new BBSPaths(root).node(1).playpen();
    fs.mkdirSync(playpen, { recursive: true });
    fs.writeFileSync(path.join(playpen, 'REPLY.LHA'), 'LHA');
    await lrzszManagers[0].opts.onComplete(true, { received: [path.join(playpen, 'REPLY.LHA')], skipped: [] });
    await settle();
    await type(['for you', '\r', '\r']);
    await type(['\r']);
    await flow;

    const msgBase2 = path.join(root, 'Conf2', 'MsgBase');
    expect(bodyFiles(2)).toEqual(['1', '2']);
    expect(fs.readdirSync(path.join(msgBase2, 'F2')).sort()).toEqual(['REPLY.LHA', 'REPLY.LHA.dis']);
    expect(bodyFiles(1)).toEqual([]);
    expect(fs.readdirSync(path.join(root, 'Conf1', 'MsgBase')).filter((d) => /^F\d+$/.test(d))).toEqual([]);
  });
});
