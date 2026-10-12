/**
 * The sysop's 1 (express.e internalCommand1 -> editAccounts, 22400-22457)
 * printed its menu and read nothing: its keys went to `session.inputCallback`,
 * which nothing calls, so the next key went back to the main menu. And the
 * account editor's own keys (editInfo, sub-state ACCOUNT_EDITOR_EDIT) were
 * never dispatched by handleCommand at all.
 *
 * Driven as the sysop types it: the 1 command's handler, then every key
 * through the real handleCommand, one per call. Checked where AmiExpress reads
 * it - the user.data record.
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

// applyConfPresets / deleteConfAccess walk every Conf.DB of the board.
const confDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'acct-1-')), 'Conf.DB');
jest.mock('../../src/services/delete-conf-access', () => {
  const actual = jest.requireActual('../../src/services/delete-conf-access');
  return { ...actual, confDbFiles: () => [confDb] };
});

import * as commandHandler from '../../src/handlers/command.handler';
import { handleAccountEditingCommand } from '../../src/handlers/commands/sysop-commands.handler';
import { userFileManager } from '../../src/services/UserFileManager';
import { userDatabaseManager } from '../../src/services/UserDatabaseManager';
import { BBSState, LoggedOnSubState } from '../../src/index';

async function waitForTestDb(): Promise<any> {
  for (let i = 0; i < 30 && !(global as any).testDb; i++) await new Promise(r => setTimeout(r, 500));
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

let made = 0;
async function makeAccount(db: any, extra: Record<string, unknown> = {}): Promise<any> {
  made++;
  const id = await db.createUser({
    username: `one_${Date.now()}_${made}`, passwordHash: 'h', realname: 'One', location: 'X', phone: '',
    email: '', secLevel: 20, uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0, ratio: 0,
    ratioType: 0, timeTotal: 3600, timeLimit: 3600, timeUsed: 0, chatLimit: 0, chatUsed: 0,
    lastLogin: null, firstLogin: new Date(), calls: 0, callsToday: 0, newUser: false, expert: 'N',
    ansi: true, linesPerScreen: 23, computer: '', screenType: '', protocol: '', editor: '',
    zoomType: '', availableForChat: false, quietNode: false, autoRejoin: 1, confAccess: 'XX',
    areaName: '', uuCP: false, topUploadCPS: 0, topDownloadCPS: 0, byteLimit: 0, baud: 0,
    ...extra,
  });
  await db.appendUserToDisk(id);
  return db.getUserById(id);
}

const settle = () => new Promise((r) => setTimeout(r, 25));

function sysop() {
  const out: string[] = [];
  const socket: any = {
    id: `acct-1-${Math.random()}`, emit: (_e: string, t: any) => out.push(String(t)), on() {}, off() {}, removeListener() {},
  };
  const session: any = {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.READ_COMMAND,
    connectionType: 'web',
    nodeId: 1,
    currentConf: 1,
    user: { id: 'sysop', username: 'sysop', secLevel: 255, slotNumber: 1 },
    tempData: undefined,
  };
  return {
    out,
    session,
    text: () => out.join(''),
    one: async () => { await handleAccountEditingCommand(socket, session); await settle(); },
    /** Keys as the transport delivers them: one handleCommand per key. */
    keys: async (keys: string) => {
      for (const k of keys) { await commandHandler.handleCommand(socket, session, k); await settle(); }
    },
  };
}

describe("the sysop's 1 reads its keys", () => {
  let db: any;
  beforeAll(async () => { db = await waitForTestDb(); }, 30000);

  /** editAccounts has returned: nothing waits for a key, and its sub-state is gone. */
  const left = (s: ReturnType<typeof sysop>) => {
    expect(s.session.inputWaiter).toBeUndefined();
    expect(s.session.subState).not.toBe(LoggedOnSubState.ACCOUNT_EDITOR_MENU);
  };

  it('a slot number opens the editor, a field edit is saved by ~, TAB returns to the menu, Enter leaves', async () => {
    const account = await makeAccount(db);
    const slot = account.slotNumber;
    const s = sysop();
    await s.one();
    expect(s.text()).toContain('\r\nI>nactive accounts: Exclude  S>earch by name  N>ew account editing\r\nC>redit Accounts  B>ulk editing\r\nEdit which account? ');

    await s.keys(`${slot}\r`);
    // editInfo drew the account (express.e 22983-22989) and reads its keys.
    expect(s.session.subState).toBe(LoggedOnSubState.ACCOUNT_EDITOR_EDIT);
    expect(s.text()).toContain(`  ACTIVE\x1b[0m [${slot}]`);

    await s.keys('F');
    await s.keys('\x18BETA\r');
    await s.keys('~');
    expect(userFileManager.readUserBySlot(slot)!.confAccess).toBe('BETA');

    s.out.length = 0;
    await s.keys('\t');
    expect(s.text()).toContain('Edit which account? ');
    expect(s.session.subState).toBe(LoggedOnSubState.ACCOUNT_EDITOR_MENU);

    await s.keys('\r');
    left(s);
  });

  it('a number past the last account says so and leaves, as express.e does (22384, 22447)', async () => {
    const s = sysop();
    await s.one();
    const past = userDatabaseManager.getUserCount() + 5;
    await s.keys(`${past}\r`);
    expect(s.text()).toContain('Higher Than Maximum Account\r\n\r\n');
    left(s);
  });

  it('S finds the account by name and TAB goes on to the next one of that name (22427-22443)', async () => {
    const account = await makeAccount(db);
    const s = sysop();
    await s.one();
    await s.keys('S\r');
    await s.keys(`${account.username}\r`);
    expect(s.session.subState).toBe(LoggedOnSubState.ACCOUNT_EDITOR_EDIT);
    expect(s.text()).toContain(`[${account.slotNumber}]`);
    await s.keys('\t');
    expect(s.text()).toContain('\r\nSorry no user under that name.\r\n');
    expect(s.session.subState).toBe(LoggedOnSubState.ACCOUNT_EDITOR_MENU);
  });

  it('the bulk editor writes minutes as seconds, the byte limit and the area, to the matching accounts only (23688-23794)', async () => {
    const area = `B${String(Date.now()).slice(-7)}`;
    const target = await makeAccount(db, { confAccess: area });
    const other = await makeAccount(db, { confAccess: 'ZZ' });
    const s = sysop();
    await s.one();
    await s.keys('B\r');
    expect(s.text()).toContain('\x1b[23;1H\x1b[33m~\x1b[36m=\x1b[0mApply Changes \x1b[33m@\x1b[36m=\x1b[0mPresets \x1b[33m<TAB>\x1b[36m=\x1b[0mExit\r\n');
    expect(s.text()).toContain('\x1b[6;58H\x1b[0m Leave Unchanged');

    await s.keys('1'); await s.keys(`${area}\r`);
    await s.keys('U'); await s.keys('60\r');
    await s.keys('R'); await s.keys('90\r');
    await s.keys('Y'); await s.keys('5\r');
    await s.keys('Q'); await s.keys('7000\r');
    expect(s.text()).toContain('\x1b[18;19H\x1b[34m[\x1b[0m1/');
    await s.keys('~');
    expect(s.text()).toContain('\x1b[0mUpdating users...');
    expect(s.text()).toContain('\x1b[24;1H                                     ');
    expect(s.text()).not.toContain('Updated ');

    const record = userFileManager.readUserBySlot(target.slotNumber)!;
    expect(record.timeLimit).toBe(3600);
    expect(record.timeTotal).toBe(5400);
    expect(record.chatLimit).toBe(300);
    expect(record.byteLimit).toBe(7000);
    expect(userFileManager.readUserBySlot(other.slotNumber)!.byteLimit).toBe(0);

    await s.keys('\t');
    expect(s.text()).toContain('Edit which account? ');
  });

  it('N walks the new accounts through the editor; X stops it with Abort (21741-21813)', async () => {
    await makeAccount(db, { newUser: true });
    const s = sysop();
    await s.one();
    await s.keys('N\r');
    expect(s.text()).toContain('Searching...');
    expect(s.session.subState).toBe(LoggedOnSubState.ACCOUNT_EDITOR_EDIT);
    s.out.length = 0;
    await s.keys('X');
    expect(s.text()).toContain('\x1b[JNo-Save\r\n');
    expect(s.text()).toContain('\r\nAbort\r\n\r\n');
    expect(s.text()).toContain('Edit which account? ');
  });
});
