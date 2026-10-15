/**
 * The account of a caller who is on lives in memory, and reaches user.data
 * where express.e calls saveAccount - never from the SQL row.
 *
 * express.e loads the record at logon (29664), changes loggedOnUser during the
 * call, and saves it at logoff (8207), on leaving W (25893) and after a new
 * name (25928). A save made by someone else (the sysop's editor 21293, a
 * door's SAVE_ACCOUNT 4582) is a save of the RECORD, and a door's save of the
 * caller's own slot is copied into loggedOnUser (4587-4597).
 *
 * The port's updateUser wrote the whole users row over the slot on every
 * change, mid-call or not. The row only learns the time used, the call count
 * and whatever a door or the sysop saved at the next logon, so each W toggle
 * or admin edit put them back to the row's values.
 *
 * Driven through the real repository (the global test database) and the real
 * W menu, against this run's temp board.
 */
jest.mock('../../src/handlers/command-handler/dependency-injection', () => ({
  getDoors: () => [],
}));
jest.mock('../../src/handlers/command-handler/menu', () => ({
  displayMainMenu: jest.fn(async () => undefined),
}));
jest.mock('../../src/utils/acs.util', () => ({
  ...jest.requireActual('../../src/utils/acs.util'),
  checkSecurity: () => true,
}));

import { userFileManager } from '../../src/services/UserFileManager';
import { loadAccount } from '../../src/services/load-account';
import { saveAccountAtLogoff } from '../../src/services/account.service';
import { sessions } from '../../src/server/session-manager';
import { getSystemTime, encodeAmigaDate } from '../../src/utils/date-time.util';
import { handleWOptionSelectInput } from '../../src/handlers/commands/info-commands.handler';

async function testDb(): Promise<any> {
  for (let i = 0; i < 60 && !(global as any).testDb; i++) await new Promise(r => setTimeout(r, 250));
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

let seq = 0;

/**
 * An account whose row is what the last logon left (time used 0, three
 * calls), and whose record holds what happened since: 30 minutes used, a
 * door's level 200, seven posts, its own new-since date.
 */
async function accountWithNewerRecord() {
  const db = await testDb();
  const username = `rec${Date.now() % 100000}${seq++}`;
  const row0 = await db.createUser({
    username, passwordHash: 'x', realname: 'Record Holder', location: 'Disk', phone: '', email: '',
    secLevel: 20, uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0, ratio: 0, ratioType: 0,
    timeTotal: 3600, timeLimit: 3600, timeUsed: 0, chatLimit: 600, chatUsed: 0,
    lastLogin: new Date(), firstLogin: new Date(), calls: 3, callsToday: 0, newUser: false,
    expert: 'N', ansi: true, linesPerScreen: 23, computer: '', screenType: '', protocol: '/X Zmodem',
    editor: 'Prompt', zoomType: 'QWK', availableForChat: true, quietNode: false, autoRejoin: 1,
    confAccess: 'XXXXXXXXX', areaName: '', uuCP: false, topUploadCPS: 0, topDownloadCPS: 0,
    byteLimit: 0, userFlags: 0, baud: 0,
  } as any);
  const row = await db.getUserById(String(row0.id ?? row0));
  const slot = row.slotNumber as number;
  expect(slot).toBeGreaterThan(0);
  const newSince = new Date('2026-09-01T12:00:00Z');
  userFileManager.writeUserFiles({
    ...row, secLevel: 200, timeUsed: 1800, calls: 9, messagesPosted: 7, newSinceDate: newSince,
  } as any, slot);
  return { db, row, slot, newSince };
}

function wSocket() {
  return { id: `acct-${seq++}`, emit: () => true, on() { return this; } } as any;
}

afterEach(() => sessions.clear());

describe('the account', () => {
  it('a save of the record by the sysop changes those fields and keeps the rest of the record', async () => {
    const { db, row, slot, newSince } = await accountWithNewerRecord();

    await db.updateUser(row.id, { secLevel: 50 });

    const onDisk = userFileManager.readUserBySlot(slot)!;
    expect(onDisk.secLevel).toBe(50);
    // The row said 0 used and 3 calls; the record's own values stand.
    expect(onDisk.timeUsed).toBe(1800);
    expect(onDisk.calls).toBe(9);
    expect(onDisk.messagesPosted).toBe(7);
    // Its own new-since date, not the last logon.
    expect(encodeAmigaDate(onDisk.newSinceDate)).toBe(encodeAmigaDate(newSince));
  });

  it('a W setting changes the caller in memory, and leaving W saves him as he is', async () => {
    const { row, slot } = await accountWithNewerRecord();
    const session: any = { nodeId: 7, currentConf: 1, tempData: {}, user: loadAccount(row).user };
    const writes = jest.spyOn(userFileManager, 'updateUserDataFile');

    // W option 10, screen clear: userFlags EOR 8 (express.e:25993).
    await handleWOptionSelectInput(wSocket(), session, '10');

    expect(session.user.userFlags & 8).toBe(8);
    // Nothing reached the slot mid-call (the sentinel), and the record is as it was.
    expect(writes).not.toHaveBeenCalled();
    expect(userFileManager.readUserBySlot(slot)!.userFlags & 8).toBe(0);

    // CR leaves W: express.e:25893 saveAccount.
    await handleWOptionSelectInput(wSocket(), session, '');
    expect(writes).toHaveBeenCalledTimes(1);
    writes.mockRestore();

    const onDisk = userFileManager.readUserBySlot(slot)!;
    expect(onDisk.userFlags & 8).toBe(8);
    expect(onDisk.secLevel).toBe(200);
    expect(onDisk.timeUsed).toBe(1800);
    expect(onDisk.messagesPosted).toBe(7);
  });

  it("the sysop's save of an online caller is not undone by his logoff", async () => {
    const { db, row, slot } = await accountWithNewerRecord();
    const session: any = { nodeId: 8, currentConf: 0, tempData: {}, user: loadAccount(row).user };
    sessions.set('8', session);

    await db.updateUser(row.id, { secLevel: 99 });
    expect(session.user.secLevel).toBe(99);

    session.user.timeUsed = 2400; // the rest of his call
    await saveAccountAtLogoff(session);

    const onDisk = userFileManager.readUserBySlot(slot)!;
    expect(onDisk.secLevel).toBe(99);
    expect(onDisk.timeUsed).toBe(2400);
    // ...and the row follows the record.
    const after = await db.getUserById(row.id);
    expect(after.secLevel).toBe(99);
    expect(after.timeUsed).toBe(2400);
  });

  it('the new-since date moves only at a logoff after N (express.e:8197)', async () => {
    const { row, slot, newSince } = await accountWithNewerRecord();

    const quiet: any = { nodeId: 9, currentConf: 0, user: loadAccount(row).user };
    expect(encodeAmigaDate(quiet.user.newSinceDate)).toBe(encodeAmigaDate(newSince));
    await saveAccountAtLogoff(quiet);
    expect(encodeAmigaDate(userFileManager.readUserBySlot(slot)!.newSinceDate)).toBe(encodeAmigaDate(newSince));

    const afterN: any = { nodeId: 9, currentConf: 0, newSinceFlag: true, user: loadAccount(row).user };
    const before = getSystemTime().getTime();
    await saveAccountAtLogoff(afterN);
    const moved = userFileManager.readUserBySlot(slot)!.newSinceDate!.getTime();
    expect(moved).toBeGreaterThanOrEqual(before - 2000);
  });
});
