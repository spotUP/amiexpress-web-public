/**
 * Under ACS_CONFERENCE_ACCOUNTING the caller's counters are the joined
 * conference's, and the account's totals are their sum at logoff.
 *
 * express.e:4893-4909 loadMsgPointers copies the conference record's bytes,
 * files, ratio and post count into loggedOnUser; saveMsgPointers (4927-4945)
 * copies them back; a download is booked into the FILE's conference record
 * between the two (15439-15452); addMsgPointers (8626-8659) sums every
 * conference into the account before the logoff's saveAccount (8204-8207).
 *
 * The port kept adding each transfer to the account totals as well, and wrote
 * those totals to user.data per file - so FS, the ratio and the account said
 * three different things.
 *
 * Driven through joinConference's account half, the real download booking and
 * the real logoff save, on this run's temp board.
 */
jest.mock('../../src/utils/acs.util', () => ({
  ...jest.requireActual('../../src/utils/acs.util'),
  checkSecurity: () => true,
}));

import { userFileManager } from '../../src/services/UserFileManager';
import { messagePointerFileManager } from '../../src/services/MessagePointerFileManager';
import { loadConferenceAccount, saveConferenceAccount } from '../../src/utils/message-pointers.util';
import { bookDownloads } from '../../src/services/download-booking.service';
import { saveAccountAtLogoff } from '../../src/services/account.service';
import { loadAccount } from '../../src/services/load-account';

async function testDb(): Promise<any> {
  for (let i = 0; i < 60 && !(global as any).testDb; i++) await new Promise(r => setTimeout(r, 250));
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

async function caller() {
  const db = await testDb();
  const row0 = await db.createUser({
    username: `acct${Date.now() % 100000}`, passwordHash: 'x', realname: 'Counter', location: '', phone: '', email: '',
    secLevel: 30, uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0, ratio: 0, ratioType: 0,
    timeTotal: 3600, timeLimit: 3600, timeUsed: 0, chatLimit: 600, chatUsed: 0,
    lastLogin: new Date(), firstLogin: new Date(), calls: 1, callsToday: 0, newUser: false,
    expert: 'N', ansi: true, linesPerScreen: 23, computer: '', screenType: '', protocol: '/X Zmodem',
    editor: 'Prompt', zoomType: 'QWK', availableForChat: true, quietNode: false, autoRejoin: 1,
    confAccess: 'XXXXXXXXX', areaName: '', uuCP: false, topUploadCPS: 0, topDownloadCPS: 0,
    byteLimit: 0, userFlags: 0, baud: 0,
  } as any);
  const row = await db.getUserById(String(row0.id ?? row0));
  const slot = row.slotNumber as number;
  // The account as the last logoff left it: the sum of two conferences.
  userFileManager.writeUserFiles({ ...row, uploads: 8, downloads: 3, bytesUpload: 8000, bytesDownload: 3000, messagesPosted: 5 } as any, slot);
  messagePointerFileManager.putAccount(1, slot, { uploads: 3, downloads: 1, bytesUpload: 3000, bytesDownload: 1000, ratioType: 0, ratio: 0 });
  messagePointerFileManager.patchRecord(1, slot, { messagesPosted: 2 });
  messagePointerFileManager.putAccount(2, slot, { uploads: 5, downloads: 2, bytesUpload: 5000, bytesDownload: 2000, ratioType: 1, ratio: 3 });
  messagePointerFileManager.patchRecord(2, slot, { messagesPosted: 3 });
  const session: any = { nodeId: 4, currentConf: 0, currentMsgBase: 1, tempData: {}, user: loadAccount(row).user };
  return { session, slot };
}

describe('conference accounting', () => {
  it("swaps the conference's counters in and out, books into the file's conference, and sums them at logoff", async () => {
    const { session, slot } = await caller();

    // The join (express.e:5026): conference 2's counters and ratio are his.
    loadConferenceAccount(session, 2);
    session.currentConf = 2;
    expect(session.user.uploads).toBe(5);
    expect(session.user.downloads).toBe(2);
    expect(session.user.ratio).toBe(3);
    expect(session.user.messagesPosted).toBe(3);

    // An upload and a post land on the live account (19382, 10558)...
    session.user.uploads += 1;
    session.user.bytesUpload += 700;
    session.user.messagesPosted += 1;

    // ...and a download of a conference-1 file is booked into conference 1's
    // record, between a save and a load of conference 2 (15441-15452).
    const writes = jest.spyOn(userFileManager, 'updateUserDataFile');
    await bookDownloads(session, [{ name: 'a.lha', size: 400, confNum: 1 }]);
    expect(writes).not.toHaveBeenCalled(); // not per file: at logoff
    writes.mockRestore();

    expect(session.user.downloads).toBe(2); // conference 2's, untouched
    expect(messagePointerFileManager.readRecordOrZero(1, slot).downloads).toBe(2);
    expect(messagePointerFileManager.readRecordOrZero(2, slot).upload).toBe(6);

    // J to conference 1 (25121 then 5026).
    saveConferenceAccount(session, 2);
    loadConferenceAccount(session, 1);
    session.currentConf = 1;
    expect(session.user.uploads).toBe(3);
    expect(session.user.downloads).toBe(2);

    // Logoff: every conference summed into the account, then saved.
    await saveAccountAtLogoff(session);
    const onDisk = userFileManager.readUserBySlot(slot)!;
    expect(onDisk.uploads).toBe(3 + 6);
    expect(onDisk.downloads).toBe(2 + 2);
    expect(onDisk.bytesUpload).toBe(3000 + 5700);
    expect(onDisk.bytesDownload).toBe(1400 + 2000);
    expect(onDisk.messagesPosted).toBe(2 + 4);
  });
});
