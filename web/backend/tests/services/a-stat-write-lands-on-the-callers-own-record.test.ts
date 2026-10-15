/**
 * A stat a door writes lands on the caller's own record.
 *
 * 15296b912 made every user record 1-indexed - `readUserFromDisk`,
 * `readConfAccessFromDisk`, the new-user append - because the class had been
 * addressing 0-based while every caller passed the Amiga slot, so one
 * account's password failures were written into the neighbour's record.
 *
 * `writeUserStatToDisk` was left on the old arithmetic. It is the path every
 * 68K door takes through XIM to update uploads, downloads, messages posted,
 * times called and the byte counters, so a door crediting an upload credited
 * the NEXT account, while the read that follows came back from the caller's
 * own record. Probed before fixing: slot 1's uploads landed in record 2.
 *
 * The assertions go through `readUserFromDisk`, not through offsets computed
 * here: what matters is that the write and the read agree about which record
 * a slot is, and a test that recomputed the arithmetic could agree with a
 * wrong answer.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { userDatabaseManager } from '../../src/services/UserDatabaseManager';

const USER_SIZE = 232;
const USERKEYS_SIZE = 56;
const USERMISC_SIZE = 248;

/** A board with three empty user records. */
function boardWithThreeSlots(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stat-slot-'));
  fs.writeFileSync(path.join(root, 'user.data'), Buffer.alloc(USER_SIZE * 3));
  fs.writeFileSync(path.join(root, 'user.keys'), Buffer.alloc(USERKEYS_SIZE * 3));
  fs.writeFileSync(path.join(root, 'user.misc'), Buffer.alloc(USERMISC_SIZE * 3));
  return root;
}

function pointAt(root: string): void {
  (userDatabaseManager as any).userDataPath = path.join(root, 'user.data');
  (userDatabaseManager as any).userKeysPath = path.join(root, 'user.keys');
  (userDatabaseManager as any).userMiscPath = path.join(root, 'user.misc');
}

describe('a stat written for one slot', () => {
  let root: string;

  beforeEach(() => {
    root = boardWithThreeSlots();
    pointAt(root);
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('is read back on the SAME slot, not the next one', () => {
    userDatabaseManager.writeUserStatToDisk(1, 'uploads', 7777);

    expect(userDatabaseManager.readUserFromDisk(1)!.user.uploads).toBe(7777);
    expect(userDatabaseManager.readUserFromDisk(2)!.user.uploads).toBe(0);
  });

  it('does the same for a slot in the middle of the file', () => {
    userDatabaseManager.writeUserStatToDisk(2, 'downloads', 42);

    expect(userDatabaseManager.readUserFromDisk(2)!.user.downloads).toBe(42);
    expect(userDatabaseManager.readUserFromDisk(1)!.user.downloads).toBe(0);
    expect(userDatabaseManager.readUserFromDisk(3)!.user.downloads).toBe(0);
  });

  it('writes the fields a door updates through XIM, all of them', () => {
    // Every field data-query.ts names. Three of them - timeLastOn,
    // dailyBytesLimit, dailyBytesDld - were absent from the offset map, so a
    // door writing them got a console warning and no change on disk.
    userDatabaseManager.writeUserStatToDisk(1, 'messagesPosted', 12);
    userDatabaseManager.writeUserStatToDisk(1, 'timesCalled', 34);
    userDatabaseManager.writeUserStatToDisk(1, 'timeUsed', 560);
    userDatabaseManager.writeUserStatToDisk(1, 'timeTotal', 7800);
    userDatabaseManager.writeUserStatToDisk(1, 'bytesUpload', 90000);
    userDatabaseManager.writeUserStatToDisk(1, 'bytesDownload', 12345);
    userDatabaseManager.writeUserStatToDisk(1, 'timeLastOn', 1788902699);
    userDatabaseManager.writeUserStatToDisk(1, 'dailyBytesLimit', 555000);
    userDatabaseManager.writeUserStatToDisk(1, 'dailyBytesDld', 111);

    const me = userDatabaseManager.readUserFromDisk(1)!.user;
    expect(me.messagesPosted).toBe(12);
    expect(me.timesCalled).toBe(34);
    expect(me.timeUsed).toBe(560);
    expect(me.timeTotal).toBe(7800);
    expect(me.bytesUpload).toBe(90000);
    expect(me.bytesDownload).toBe(12345);
    expect(me.timeLastOn).toBe(1788902699);
    expect(me.dailyBytesLimit).toBe(555000);
    expect(me.dailyBytesDld).toBe(111);

    // ...and none of it reached the neighbour.
    const next = userDatabaseManager.readUserFromDisk(2)!.user;
    expect(next.messagesPosted).toBe(0);
    expect(next.bytesUpload).toBe(0);
    expect(next.timeLastOn).toBe(0);
  });

  it('refuses slot 0, which is not a record', () => {
    userDatabaseManager.writeUserStatToDisk(0, 'uploads', 999);

    expect(userDatabaseManager.readUserFromDisk(1)!.user.uploads).toBe(0);
  });
});
