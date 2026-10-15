/**
 * GDPR erasure reaches the board's disk, where R reads.
 *
 * The board's truth is its Amiga files: R (read-msg.ts) reads each message's
 * From/To out of Conf<n>/MsgBase/HeaderFile and its text out of the body file
 * beside it, and the logon reads the account out of user.data. Erasure used to
 * scrub only the SQL mirror (gdpr-erasure.service.ts, `UPDATE messages`), so
 * after "Your data has been erased." R still showed the caller's name and
 * every word they had posted, and their user.data record was still a live,
 * undeleted account.
 *
 * Driven through the W 20 erasure's last step (handleForgetMeUsernameInput),
 * on a board of its own: a real database, user.data / user.keys / user.misc
 * written by createUser, a Conf.DB, and a HeaderFile + body files; then R,
 * through the reader's own entry point, as another caller.
 */
process.env.SKIP_DB_INIT = '1';
process.env.SKIP_SERVER_START = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gdpr-disk-'));
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdpr-disk-db-'));
const saved = {
  BBS_ROOT: process.env.BBS_ROOT,
  BBS_DATA_DIR: process.env.BBS_DATA_DIR,
  DATABASE_DIR: process.env.DATABASE_DIR,
  DATABASE_FILE: process.env.DATABASE_FILE,
};

// Every module below captures the board root when it loads: a fresh registry
// after the environment points at this board.
let mods: {
  db: any;
  gdpr: typeof import('../src/handlers/user/gdpr.handler');
  messaging: typeof import('../src/handlers/message/messaging.handler');
  command: typeof import('../src/handlers/command.handler');
  index: typeof import('../src/services/MessageIndexManager');
  users: typeof import('../src/services/UserFileManager');
  screen: typeof import('../src/handlers/screen.handler');
  constants: typeof import('../src/constants/bbs-states');
  confbase: typeof import('../src/services/MessagePointerFileManager');
};

const ALICE = 'alicezed';
const ALICE_REAL = 'Alice Zedborough';
const ALICE_EMAIL = 'alice@zed.example';
const ALICE_TEXT = 'my alice-only words about the demo party';
const ALICE_PRIVATE = 'alice whispers to bob';

// Each account its own phone: the record carries it (UserFileManager), so a
// shared number would be found on disk in the account that keeps it.
function account(username: string, realname: string, email: string, phone = '555-0199'): any {
  return {
    username, passwordHash: 'hash', realname, location: 'Zedtown', phone, email,
    secLevel: 20, uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0,
    ratio: 0, ratioType: 0, timeTotal: 0, timeLimit: 60, timeUsed: 0,
    chatLimit: 30, chatUsed: 0, firstLogin: new Date(), lastLogin: new Date(),
    calls: 1, callsToday: 1, newUser: false, expert: 'N', ansi: true,
    linesPerScreen: 23, computer: 'AMiGA 500', screenType: 'ANSI',
    protocol: 'ZMODEM', editor: 'FULL', zoomType: 'NONE',
    availableForChat: true, quietNode: false, autoRejoin: 1,
    confAccess: 'XXX', areaName: '', uuCP: false,
    topUploadCPS: 0, topDownloadCPS: 0, byteLimit: 0, userFlags: 0,
  };
}

function post(n: number, from: string, to: string, subject: string, status: number, body: string): void {
  mods.index.messageIndexManager.appendMessageHeader(1, {
    status, msgNumb: n, toName: to, fromName: from, subject, msgDate: 1_700_000_000 + n, recv: 0, extMsgNum: 0,
  });
  fs.writeFileSync(path.join(root, 'Conf1', 'MsgBase', String(n)), body + '\n', 'latin1');
}

const diskBytes = () =>
  ['user.data', 'user.keys', 'user.misc'].map(f => fs.readFileSync(path.join(root, f)).toString('latin1')).join('');

beforeAll(async () => {
  process.env.BBS_ROOT = root;
  process.env.BBS_DATA_DIR = root;
  process.env.DATABASE_DIR = dbDir;
  process.env.DATABASE_FILE = 'gdpr.db';
  fs.mkdirSync(path.join(root, 'Conf1', 'MsgBase'), { recursive: true });

  jest.resetModules();
  // The fixture board has no Access/ files. Bob may use R and everything
  // else - except reading other callers' private mail, so the reader's own
  // private-mail rule decides what he sees.
  jest.doMock('../src/utils/acs.util', () => {
    const actual = jest.requireActual('../src/utils/acs.util');
    const { ACSPermission } = jest.requireActual('../src/constants/acs-permissions');
    return { ...actual, checkSecurity: (_user: unknown, perm: unknown) => perm !== ACSPermission.SYSOP_READ };
  });
  const database = require('../src/database');
  mods = {
    db: database.db,
    gdpr: require('../src/handlers/user/gdpr.handler'),
    messaging: require('../src/handlers/message/messaging.handler'),
    command: require('../src/handlers/command.handler'),
    index: require('../src/services/MessageIndexManager'),
    users: require('../src/services/UserFileManager'),
    screen: require('../src/handlers/screen.handler'),
    constants: require('../src/constants/bbs-states'),
    confbase: require('../src/services/MessagePointerFileManager'),
  };
  await mods.db.init();

  mods.index.messageIndexManager.initializeMessageIndex(1);
  mods.screen.setConferences([
    { id: 1, name: 'General', description: '', created: new Date(), updated: new Date() },
  ] as any);
  mods.messaging.setMessagingDependencies({ db: { updateReadPointer: async () => undefined } });
}, 60000);

afterAll(async () => {
  try { await mods?.db?.close?.(); } catch { /* closed */ }
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(dbDir, { recursive: true, force: true });
});

function reader(username: string) {
  const out: string[] = [];
  const socket: any = {
    id: `gdpr-reader-${Math.random()}`,
    emit: (_e: string, t: any) => out.push(String(t)),
    on() {}, off() {}, removeListener() {}, disconnect() {},
  };
  const session: any = {
    state: 'loggedon',
    subState: mods.constants.LoggedOnSubState.READ_COMMAND,
    nodeId: 1, currentConf: 1, currentMsgBase: 1, lastMsgReadConf: 0, screenWidth: 80,
    user: { id: 99, username, secLevel: 20, securityFlags: '', userFlags: 0 },
    tempData: {},
    commandHistory: [],
  };
  const settle = () => new Promise(r => setTimeout(r, 40));
  return {
    out,
    /** R from message 1, then NS: every message the caller may read, non-stop. */
    async readAll(): Promise<string> {
      await mods.messaging.handleReadMessagesFullCommand(socket, session, '1');
      await settle();
      for (const ch of 'ns\r') await mods.command.handleCommand(socket, session, ch);
      for (let i = 0; i < 100 && !out.join('').includes('carol is untouched'); i++) await settle();
      return out.join('');
    },
  };
}

describe('GDPR erasure (W 20) reaches the disk R reads', () => {
  it('R shows neither the erased name nor their text, and their record is a deleted account', async () => {
    const { MsgStatus } = mods.index;
    // As the new-user flow registers a caller: the row, then the disk record.
    const bobId = await mods.db.createUser(account('bobby', 'Bob Bobson', 'bob@example', '555-0100'));
    await mods.db.appendUserToDisk(bobId);
    const aliceId = await mods.db.createUser(account(ALICE, ALICE_REAL, ALICE_EMAIL));
    await mods.db.appendUserToDisk(aliceId);
    const alice = await mods.db.getUserById(aliceId);
    const slot: number = alice.slotNumber;
    expect(slot).toBeGreaterThan(0);
    expect(diskBytes()).toContain(ALICE);

    // Conf.DB with every record's bytes set, so a cleared record shows.
    const recordSize = mods.confbase.CONFBASE_RECORD_SIZE;
    fs.writeFileSync(path.join(root, 'Conf1', 'Conf.DB'), Buffer.alloc(recordSize * (slot + 1), 0x11));

    post(1, ALICE, 'ALL', 'Party', MsgStatus.NORMAL, ALICE_TEXT);
    post(2, 'bobby', ALICE, 'Re: Party', MsgStatus.PRIVATE, 'bob words for alice');
    post(3, ALICE, 'bobby', 'Psst', MsgStatus.PRIVATE, ALICE_PRIVATE);
    post(4, 'carol', 'ALL', 'Other', MsgStatus.NORMAL, 'carol is untouched');

    // Her uploads in the listings (express.e:19506-19509 `Sent by:`), in
    // Conftop's ctop.data, and her logon line in the CallersLog.
    const conf1 = path.join(root, 'Conf1');
    const dirEntry = (file: string, who: string) =>
      `${file.padEnd(13)} P   12K 10-01-26 Gr\xFC\xDFe aus der Demo\n${' '.repeat(33)}Sent by: ${who}\n`;
    fs.writeFileSync(path.join(conf1, 'DIR1'), Buffer.from(dirEntry('ALICE.LHA', ALICE) + dirEntry('BOB.LHA', 'bobby'), 'latin1'));
    fs.mkdirSync(path.join(conf1, 'HOLD'), { recursive: true });
    fs.writeFileSync(path.join(conf1, 'HOLD', 'HELD'), Buffer.from(dirEntry('HELD.LHA', ALICE), 'latin1'));
    fs.mkdirSync(path.join(conf1, 'Upload'), { recursive: true });
    fs.writeFileSync(path.join(conf1, 'Upload', 'FILES.BBS'), Buffer.from(dirEntry('ALICE.LHA', ALICE), 'latin1'));
    const ctop = require('@amiexpress/bbs-door-sdk/formats/ctop-data');
    fs.writeFileSync(path.join(conf1, 'ctop.data'), Buffer.concat([
      ctop.encodeCtopHeader({
        resetDate: 17800, startDate: 17793, topUpName: ALICE, topUpBytes: 999n, topUpFiles: 3,
        periodUpName: 'bobby', periodUpBytes: 5n, periodUpFiles: 1,
      }),
      ctop.encodeCtopRecord({ userName: ALICE, location: 'Zedtown', bytes: 12345 }),
      ctop.encodeCtopRecord({ userName: 'bobby', location: 'Bobville', bytes: 777 }),
    ]));
    fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Node1', 'CallersLog'),
      `**************************************************************\n10-01-26 (12:00:00) [${slot}] ${ALICE} (CONNECT 19200) Zedtown\n`);

    // The sysop's safety copies of the message base: a HeaderFile copy beside
    // the live one, and a whole-conference copy with a body file of its own.
    const msgBase = path.join(conf1, 'MsgBase');
    const headerCopy = path.join(msgBase, 'HeaderFile.pre-date-migration-2026-10-04.backup');
    fs.copyFileSync(path.join(msgBase, 'HeaderFile'), headerCopy);
    const confCopy = path.join(root, 'Conf1.backup-2026-05-27', 'MsgBase');
    fs.mkdirSync(confCopy, { recursive: true });
    fs.copyFileSync(path.join(msgBase, 'HeaderFile'), path.join(confCopy, 'HeaderFile'));
    fs.writeFileSync(path.join(confCopy, '1'), ALICE_TEXT + '\n', 'latin1');
    fs.writeFileSync(path.join(confCopy, '4'), 'carol is untouched\n', 'latin1');
    const carolRecord = fs.readFileSync(headerCopy).subarray(3 * 110, 4 * 110);

    // Before: R shows her (the fixture is what the board holds).
    const before = await reader('bobby').readAll();
    expect(before).toContain(ALICE);
    expect(before).toContain(ALICE_TEXT);

    // The erasure, through the W 20 flow's last step.
    const socket: any = { id: `gdpr-${Math.random()}`, emit() {}, on() {}, disconnect() {} };
    const session: any = {
      state: 'loggedon', subState: mods.constants.LoggedOnSubState.W_FORGETME_USERNAME,
      nodeId: 1, user: alice, inputBuffer: '',
    };
    const updateHeader = jest.spyOn(mods.index.messageIndexManager, 'updateMessageHeader');
    await mods.gdpr.handleForgetMeUsernameInput(socket, session, ALICE);
    await new Promise(r => setTimeout(r, 600)); // the handler's own disconnect timer

    const erased = (await mods.db.getUserById(aliceId)).username as string;
    expect(erased).toMatch(/^erased_/);

    // R, as Bob: her name and her words are gone; Bob's and Carol's stay.
    const after = await reader('bobby').readAll();
    expect(after).not.toMatch(new RegExp(ALICE, 'i'));
    expect(after).not.toContain(ALICE_TEXT);
    expect(after).not.toContain(ALICE_PRIVATE);
    expect(after).toContain(erased);
    expect(after).toContain('*** erased ***');
    expect(after).toContain('bob words for alice');
    expect(after).toContain('carol is untouched');
    // Sentinel: it was the erasure, through the board's HeaderFile writer.
    expect(updateHeader).toHaveBeenCalled();
    updateHeader.mockRestore();

    // The safety copies: her name gone from both HeaderFile copies, the body
    // she wrote gone from the whole-conference copy, Carol's record and body
    // the bytes they were.
    for (const copy of [headerCopy, path.join(confCopy, 'HeaderFile')]) {
      const bytes = fs.readFileSync(copy);
      expect(bytes.toString('latin1')).not.toMatch(new RegExp(ALICE, 'i'));
      expect(bytes.toString('latin1')).toContain(erased);
      expect(bytes.subarray(3 * 110, 4 * 110).equals(carolRecord)).toBe(true);
    }
    expect(fs.readFileSync(path.join(confCopy, '1'), 'latin1')).toBe('*** erased ***\n');
    expect(fs.readFileSync(path.join(confCopy, '4'), 'latin1')).toBe('carol is untouched\n');

    // The message base is still the same base: same numbers, same statuses.
    const headers = mods.index.messageIndexManager.readHeaderFile(1);
    expect(headers.map(h => h.msgNumb)).toEqual([1, 2, 3, 4]);
    expect(headers.map(h => h.status)).toEqual([MsgStatus.NORMAL, MsgStatus.PRIVATE, MsgStatus.PRIVATE, MsgStatus.NORMAL]);

    // Her account record: no name, real name, email or phone left on disk,
    // and the record is the deleted account the logon refuses (29701).
    const bytes = diskBytes();
    expect(bytes).not.toContain(ALICE);
    expect(bytes).not.toContain(ALICE_REAL);
    expect(bytes).not.toContain(ALICE_EMAIL);
    expect(bytes).not.toContain('555-0199');
    expect(mods.users.userFileManager.readUserBySlot(slot)?.accountDeleted).toBe(true);

    // deleteConfAccess: her Conf.DB record is cleared after its handle bytes.
    const confDb = fs.readFileSync(path.join(root, 'Conf1', 'Conf.DB'));
    const record = confDb.subarray((slot - 1) * recordSize, slot * recordSize);
    expect([...record.subarray(16)].every(b => b === 0)).toBe(true);
    expect([...confDb.subarray(slot * recordSize)].every(b => b === 0x11)).toBe(true);

    // The listings name the erased handle as the uploader; the description
    // (Latin-1) and Bob's entry are byte for byte what they were.
    expect(fs.readFileSync(path.join(conf1, 'DIR1')).toString('latin1'))
      .toBe(dirEntry('ALICE.LHA', erased) + dirEntry('BOB.LHA', 'bobby'));
    expect(fs.readFileSync(path.join(conf1, 'HOLD', 'HELD')).toString('latin1')).toBe(dirEntry('HELD.LHA', erased));
    expect(fs.readFileSync(path.join(conf1, 'Upload', 'FILES.BBS')).toString('latin1')).toBe(dirEntry('ALICE.LHA', erased));
    // Conftop: her record and her record-holder line take the handle, her
    // location goes; the bytes and Bob's record stay.
    const top = ctop.decodeCtopFile(fs.readFileSync(path.join(conf1, 'ctop.data')));
    expect(top.header).toMatchObject({ topUpName: erased, topUpBytes: 999n, periodUpName: 'bobby' });
    expect(ctop.decodeCtopRecords(fs.readFileSync(path.join(conf1, 'ctop.data')))).toEqual([
      { userName: erased, location: '', bytes: 12345 },
      { userName: 'bobby', location: 'Bobville', bytes: 777 },
    ]);
    // CallersLog: the logon line keeps its shape, without her name or town.
    expect(fs.readFileSync(path.join(root, 'Node1', 'CallersLog'), 'latin1'))
      .toBe(`**************************************************************\n10-01-26 (12:00:00) [${slot}] ${erased} (CONNECT 19200) \n`);
  }, 30000);
});
