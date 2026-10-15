/**
 * X at Msg. Options uploads files into the message, and R offers them.
 *
 * express.e edit() X (10562-10566) sets rzmsg; saveNewMSG (10721-10740) then
 * runs uploadaFile(0,'',TRUE) inside the save: the files go to
 * <msgBaseLocation>F<n>/<name> with an F<n>/<name>.dis listing (19398-19509),
 * and only then does the save return to its caller. Before this the board
 * offered X, saved the message, and uploaded nothing.
 *
 * Driven through handleCommand from the menu - E, the editor, X, the upload
 * prompts, the transfer (a fake lrzsz whose receive lands a file in the
 * playpen), the description - over a real message base, on a telnet and on a
 * web caller. Then R on the message offers the file.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock('../../src/handlers/screen.handler', () => ({
  ...jest.requireActual('../../src/handlers/screen.handler'),
  displayScreen: jest.fn(async () => false),
  continueAfterScreen: jest.fn(async (_s: any, _se: any, next: () => unknown) => { await next(); return false; }),
}));
const mockDb: Record<string, any> = {
  query: jest.fn(async () => ({ rows: [] })),
  run: jest.fn(async () => undefined),
  createFileEntry: jest.fn(async () => 1),
  getConferenceById: jest.fn(async () => ({ id: 1, name: 'General' })),
  getMessageBaseById: jest.fn(async () => ({ id: 1, name: 'Main' })),
  getFileAreas: jest.fn(async () => [{ id: 1, conferenceId: 1, name: 'Uploads' }]),
  getWebhooksByTrigger: jest.fn(async () => []),
  createMessage: jest.fn(async () => 1),
  getUserByUsername: jest.fn(async () => null),
};
(globalThis as any).__xUploadDb = mockDb;
// The catalogue's calls answered here; everything else is the real module.
jest.mock('../../src/database', () => {
  const actual = jest.requireActual('../../src/database');
  return { ...actual, db: new Proxy({}, { get: (_t, prop) => (globalThis as any).__xUploadDb?.[prop] ?? actual.db[prop] }) };
});
jest.mock('../../src/server/database-helpers', () => ({ callersLog: jest.fn(async () => undefined) }));
jest.mock('../../src/utils/clean-playpen.util', () => ({ cleanPlayPen: jest.fn(async () => undefined) }));
jest.mock('../../src/services/resume-stuff.service', () => ({
  startResumeStuff: (_s: unknown, _se: unknown, _p: unknown, _c: unknown, done: (r: unknown) => void) => done({ resumed: 0 }),
}));
const lrzszManagers: any[] = [];
jest.mock('../../src/services/lrzsz-transfer.service', () => ({
  isLrzszAvailable: () => true,
  LrzszTransferManager: class {
    opts: any;
    started = false;
    constructor(opts: any) { this.opts = opts; lrzszManagers.push(this); }
    start() { this.started = true; }
    handleInput() { /* no rz */ }
  },
}));

import { config } from '../../src/config';
import { handleCommand } from '../../src/handlers/command.handler';
import { BBSState, LoggedOnSubState } from '../../src/index';
import { messageIndexManager } from '../../src/services/MessageIndexManager';
import { setFileAreas, displayUploadInterface } from '../../src/handlers/file/file.handler';
import { setUserCommandsDependencies } from '../../src/handlers/commands/user-commands.handler';
import { setMessageEntryDependencies } from '../../src/handlers/message/message-entry.handler';
import { setMessagingDependencies } from '../../src/handlers/message/messaging.handler';
import { setConferences } from '../../src/handlers/screen.handler';
import { BBSPaths } from '../../src/utils/bbs-paths.util';
import { flushOutput } from '../../src/utils/output.util';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'msg-x-upload-'));
const savedData = process.env.BBS_DATA_DIR;
const realGet = config.get.bind(config);
jest.spyOn(config, 'get').mockImplementation(((key: string) => (key === 'dataDir' ? root : realGet(key as any))) as any);

const msgBase = () => path.join(root, 'Conf1', 'MsgBase');

beforeAll(() => {
  process.env.BBS_DATA_DIR = root;
  messageIndexManager.setBbsRoot(root);
  messageIndexManager.initializeMessageIndex(1);
  setConferences([{ id: 1, name: 'General', description: '', created: new Date(), updated: new Date() }] as any);
  setFileAreas([{ id: 1, conferenceId: 1, name: 'Uploads' }]);
  setUserCommandsDependencies({
    displayScreen: async () => false,
    displayUploadInterface,
  } as any);
  setMessageEntryDependencies({ db: mockDb, callersLog: async () => {} });
  setMessagingDependencies({ db: { updateReadPointer: async () => undefined }, setEnvStat: () => undefined, callersLog: async () => undefined });
});

afterAll(() => {
  if (savedData === undefined) delete process.env.BBS_DATA_DIR;
  else process.env.BBS_DATA_DIR = savedData;
  fs.rmSync(root, { recursive: true, force: true });
});

function caller(transport: 'telnet' | 'web') {
  const out: string[] = [];
  const downloads: any[] = [];
  const once: Record<string, () => void> = {};
  const socket: any = {
    id: `x-${transport}-${Math.random()}`, connected: true,
    emit: (event: string, payload: any) => {
      if (event === 'download-file') downloads.push(payload);
      else if (event === 'ansi-output') out.push(String(payload));
      return true;
    },
    on() {}, off() {}, removeListener() {},
    once: (event: string, fn: () => void) => { once[event] = fn; },
  };
  const session: any = {
    state: BBSState.LOGGEDON, subState: LoggedOnSubState.READ_COMMAND,
    connectionType: transport, transferRawSend: transport === 'telnet' ? jest.fn() : undefined,
    nodeId: 1, currentConf: 1, currentMsgBase: 1, relConfNum: 1, bbsPath: root, screenWidth: 80, screenHeight: 25,
    lastMsgReadConf: 0, commandHistory: [], historyIndex: 0, historyCycle: 0,
    user: { id: 1, username: 'spot', name: 'spot', secLevel: 255, securityFlags: 'T'.repeat(100), userFlags: 0, confAccess: 'X' },
    tempData: {},
  };
  const settle = () => new Promise((r) => setTimeout(r, 40));
  const type = async (...keys: string[]) => {
    for (const k of keys) {
      for (const ch of k) await handleCommand(socket, session, ch);
      await settle();
    }
  };
  const screen = () => { flushOutput(socket); return out.join(''); };
  return { socket, session, downloads, once, type, settle, screen };
}

describe.each(['telnet', 'web'] as const)('X at Msg. Options, %s caller', (transport) => {
  it('uploads into MsgBase/F<n> with its .dis, and R on the message offers the file', async () => {
    lrzszManagers.length = 0;
    const c = caller(transport);

    // E, To blank (ALL), a subject, one line, Enter on a blank line.
    await c.type('e', '\r');
    await c.type('\r');
    await c.type(`files ${transport}`, '\r');
    await c.type('see the file', '\r', '\r');
    // express.e:10378 - X is offered.
    expect(c.screen()).toContain('\x1b[36m,\x1b[33mX');

    // X: the save, then the upload prompts. FileName 1: blank, Okay: Enter.
    await c.type('x', '\r');
    expect(c.screen()).toContain('done!');
    expect(c.screen()).toContain('FileName 1:');
    await c.type('\r');
    await c.type('\r');

    // The transfer: rz receives DEMO.LHA into the node's playpen.
    if (transport === 'web') c.once['transfer-raw:start']();
    expect(lrzszManagers).toHaveLength(1);
    expect(lrzszManagers[0].started).toBe(true);
    const playpen = new BBSPaths(root).node(1).playpen();
    fs.mkdirSync(playpen, { recursive: true });
    const name = transport === 'web' ? 'WEB.LHA' : 'DEMO.LHA';
    fs.writeFileSync(path.join(playpen, name), 'LHA bytes');
    await lrzszManagers[0].opts.onComplete(true, { received: [path.join(playpen, name)], skipped: [] });
    await c.settle();

    // The description, then a blank line files it.
    await c.type('my demo', '\r', '\r');
    await c.settle();

    const shown = c.screen();
    expect(shown).toContain('Moving to message base file directory.');
    expect(shown).not.toContain(`Testing... ${name}`);

    const dirs = fs.readdirSync(msgBase()).filter((d) => /^F\d+$/.test(d));
    const fDir = dirs.find((d) => fs.readdirSync(path.join(msgBase(), d)).includes(name));
    expect(fDir).toBeDefined();
    const msgNumb = Number(fDir!.slice(1));
    expect(fs.readFileSync(path.join(msgBase(), fDir!, name), 'latin1')).toBe('LHA bytes');
    expect(fs.readFileSync(path.join(msgBase(), fDir!, `${name}.dis`), 'latin1')).toMatch(new RegExp(`^${name.replace('.', '\\.')}\\s+N\\s+\\d+\\s+\\S+\\s+my demo\\n`));
    // Not into the conference: no DIR entry, no catalogue row.
    expect(fs.existsSync(path.join(root, 'Conf1', 'DIR1'))).toBe(false);
    expect(mockDb.createFileEntry).not.toHaveBeenCalled();
    // The save returned to its caller - the menu.
    expect([LoggedOnSubState.READ_COMMAND, LoggedOnSubState.DISPLAY_MENU]).toContain(c.session.subState);
    expect(c.session.uploadReturn).toBeUndefined();
    expect(c.session.rzmsg).toBeUndefined();

    // R on that message offers the file.
    await c.type('\r');
    await c.type(`r ${msgNumb}`, '\r');
    expect(c.screen()).toContain('...This message has an attached file(s), Download? (y/N/goodbye)? ');
    await c.type('y');
    expect(c.screen()).toContain(`Flagging >:${name}`);
  });
});
