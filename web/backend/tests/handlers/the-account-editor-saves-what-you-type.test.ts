/**
 * The account editor (the message reader's U, express.e editInfo
 * 21211-21650) dropped every field edit. A field key set a
 * `waitingForFieldInput` that nothing read, redrew the page, and the next key
 * was taken as a command - so typing a value and pressing ~ saved the account
 * as it was. The six fields express.e edits as conferenceAccess,
 * dailyBytesLimit, upCPS2, dnCPS2, uucpa and chatRemain were also named that
 * way on the port's account, where the record's writer never looks.
 *
 * Driven as the sysop types it: the command key through the editor, the
 * value through the input that is waiting for it (what handleCommand hands
 * every key to first), then ~. Checked where AmiExpress reads it - the
 * user.data record - and in the row.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/database', () => {
  const actual = jest.requireActual('../../src/database');
  return {
    ...actual,
    db: new Proxy({}, {
      get(_target, prop) {
        const target = (global as any).testDb ?? actual.db;
        const value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }),
  };
});

// applyConfPresets walks every Conf.DB of the board; point it at one file of
// this run's own instead of the checkout's conferences.
const confDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'acct-presets-')), 'Conf.DB');
jest.mock('../../src/services/delete-conf-access', () => {
  const actual = jest.requireActual('../../src/services/delete-conf-access');
  return { ...actual, confDbFiles: () => [confDb] };
});

import { handleAccountEditInput } from '../../src/handlers/user/account-edit-input.handler';
import { feedInputWaiter } from '../../src/utils/await-input';
import { userFileManager } from '../../src/services/UserFileManager';
import { messagePointerFileManager, deserializeConfBase, serializeConfBase } from '../../src/services/MessagePointerFileManager';
import { readTooltypeMap } from '../../src/utils/info-file.util';
import { boardRoot } from '../../src/utils/board-root.util';
import { BBSState, LoggedOnSubState } from '../../src/index';

async function waitForTestDb(): Promise<any> {
  for (let i = 0; i < 30 && !(global as any).testDb; i++) await new Promise(r => setTimeout(r, 500));
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

async function makeAccount(db: any): Promise<any> {
  const id = await db.createUser({
    username: `typed_${Date.now()}`, passwordHash: 'h', realname: 'Typed', location: 'X', phone: '',
    email: '', secLevel: 20, uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0, ratio: 0,
    ratioType: 0, timeTotal: 3600, timeLimit: 3600, timeUsed: 0, chatLimit: 0, chatUsed: 0,
    lastLogin: null, firstLogin: new Date(), calls: 0, callsToday: 0, newUser: false, expert: 'N',
    ansi: true, linesPerScreen: 23, computer: '', screenType: '', protocol: '', editor: '',
    zoomType: '', availableForChat: false, quietNode: false, autoRejoin: 1, confAccess: 'XX',
    areaName: '', uuCP: false, topUploadCPS: 0, topDownloadCPS: 0, byteLimit: 0, baud: 0,
  });
  await db.appendUserToDisk(id);
  return db.getUserById(id);
}

function editor(user: any, callerSlot = 1) {
  const out: string[] = [];
  const socket: any = { id: `acct-${Math.random()}`, emit: (_e: string, t: any) => out.push(String(t)), on() {}, off() {} };
  const session: any = {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.ACCOUNT_EDITOR_EDIT,
    nodeId: 1,
    user: { id: 'sysop', username: 'sysop', secLevel: 255, slotNumber: callerSlot },
    tempData: { accountEditing: true, editingUser: user, editingSlot: user.slotNumber, page: 0, changes: false },
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return {
    out,
    session,
    /** A command key, as the ACCOUNT_EDITOR_EDIT branch hands it over. */
    key: async (k: string) => { await handleAccountEditInput(socket, session, k); await settle(); },
    /** Keys for the input that is waiting; Ctrl-X clears its default first. */
    type: async (text: string) => {
      for (const k of `\x18${text}\r`) { feedInputWaiter(socket, session, k); await settle(); }
    },
    answer: async (k: string) => { feedInputWaiter(socket, session, k); await settle(); },
  };
}

describe('the account editor saves what the sysop types', () => {
  let db: any;
  beforeAll(async () => { db = await waitForTestDb(); }, 30000);

  it('F, Q, S, T, W, Y and Z edits were dropped on ~ and never reached user.data or the row', async () => {
    const account = await makeAccount(db);
    const e = editor(account);

    await e.key('F'); await e.type('BETA');
    await e.key('Q'); await e.type('5000');
    await e.key('S'); await e.type('1234');
    await e.key('T'); await e.type('4321');
    await e.key('W'); await e.type('1');
    await e.key('Y'); await e.type('30');
    await e.key('Z'); await e.type('10');
    await e.key('~');
    expect(e.out.join('')).toContain('\x1b[JSave\r\n');

    const record = userFileManager.readUserBySlot(account.slotNumber)!;
    expect(record.username).toBe(account.username);
    expect(record.confAccess).toBe('BETA');
    expect(record.byteLimit).toBe(5000);
    expect(record.topUploadCPS).toBe(1234);
    expect(record.topDownloadCPS).toBe(4321);
    expect(record.uuCP).toBe(true);
    expect(record.chatLimit).toBe(1800);
    expect(record.chatUsed).toBe(600);

    const row = await db.getUserById(account.id);
    expect(row.confAccess).toBe('BETA');
    expect(row.byteLimit).toBe(5000);
    expect(row.topUploadCPS).toBe(1234);
  });

  it('only the slot-1 sysop opens the password and the security level (express.e:21407, 21459)', async () => {
    const account = await makeAccount(db);
    const sysop = editor(account, 1);
    await sysop.key('H');
    await sysop.type('99');
    expect(sysop.session.tempData.editingUser.secLevel).toBe(99);

    const other = editor(account, 2);
    await other.key('H');
    // No field opened: the next key is a command, not a value.
    expect(other.session.inputWaiter).toBeUndefined();
    await other.key('D');
    expect(other.session.inputWaiter).toBeUndefined();
  });

  it('1-8 were offered on the key line and did nothing; a preset sets the account and, on yes, every conference ratio', async () => {
    const presetFile = path.join(boardRoot(), 'Access', 'PRESET.2.info');
    const preset = readTooltypeMap(presetFile);
    expect(preset.get('PRESET.AREA')).toBeDefined();
    // The slot's record in the conference starts with a ratio the preset changes.
    const account = await makeAccount(db);
    const start = deserializeConfBase(Buffer.alloc(74));
    start.ratio = 7;
    messagePointerFileManager.writeRawAt(confDb, account.slotNumber, serializeConfBase(start));

    const e = editor({ ...account, timeUsed: 120, topUploadCPS: 99 });
    await e.key('2');
    expect(e.out.join('')).toContain('\x1b[JPreset 2. ');
    expect(e.out.join('')).toContain('Preset All Conferences with Ratios & RatioType ');
    await e.answer('y');

    const user = e.session.tempData.editingUser;
    expect(user.confAccess).toBe(preset.get('PRESET.AREA')!.slice(0, 9));
    expect(user.secLevel).toBe(Number(preset.get('PRESET.ACCESS') ?? -1));
    expect(user.timeUsed).toBe(0);
    expect(user.timeTotal).toBe(user.timeLimit);
    expect(user.topUploadCPS).toBe(0);
    expect(e.session.tempData.changes).toBe(true);
    const ratio = preset.has('PRESET.RATIO') ? Number(preset.get('PRESET.RATIO')) : 7;
    expect(deserializeConfBase(messagePointerFileManager.readRawAt(confDb, account.slotNumber)).ratio).toBe(ratio);
  });
});
