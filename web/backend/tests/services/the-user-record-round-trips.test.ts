/**
 * What the user.data writer puts down, the reader gives back - and what a
 * User built from a database row does not carry, the writer leaves alone.
 *
 * The logon now runs on the record (login-loads-the-account-from-disk), so a
 * field the writer stamps with a constant is a field the caller loses:
 *
 * - expert was written `user.expert ? 1 : 0`, 1 for 'N' as well; express.e
 *   stores and compares the LETTER (24595, 26114-26119).
 * - lineLength was always 79; it is lines per screen (11272-11314).
 * - messagesPosted was `|| 0` from a row that has no such column, so every
 *   sync of the row zeroed the caller's post count.
 * - a deleted account is its record's slotNumber FIELD = 0 (21364); a row
 *   knows nothing of it, and must not undelete it by being written.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { UserFileManager } from '../../src/services/UserFileManager';
import type { User } from '../../src/database';

const REC = 232;
const SLOT_FIELD = 84;
const EXPERT = 186;
const LINE_LENGTH = 230;

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'id-r', username: 'roundtrip', realname: 'Round Trip', location: 'Here', phone: '000',
    secLevel: 30, slotNumber: 2, uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0,
    ratio: 0, ratioType: 0, timeTotal: 3600, timeLimit: 3600, timeUsed: 0, chatLimit: 0, chatUsed: 0,
    calls: 1, callsToday: 1, expert: 'N', ansi: true, linesPerScreen: 23, confAccess: 'XXXXXXXXXX',
    newUser: false, computer: '', screenType: '', protocol: '/X Zmodem', editor: 'Prompt',
    zoomType: 'QWK', availableForChat: true, quietNode: false, autoRejoin: 1, areaName: '',
    uuCP: false, topUploadCPS: 0, topDownloadCPS: 0, byteLimit: 0, userFlags: 0, passwordHash: '',
    firstLogin: new Date('2026-01-01T00:00:00Z'),
    created: new Date('2026-01-01T00:00:00Z'), updated: new Date('2026-01-01T00:00:00Z'),
    lastLogin: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as User;
}

describe('the user.data record', () => {
  let root: string;
  let mgr: UserFileManager;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'user-roundtrip-'));
    const saved = process.env.BBS_DATA_DIR;
    process.env.BBS_DATA_DIR = root;
    try { mgr = new UserFileManager(); } finally {
      if (saved === undefined) delete process.env.BBS_DATA_DIR; else process.env.BBS_DATA_DIR = saved;
    }
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const record = (slot: number) => fs.readFileSync(path.join(root, 'user.data')).subarray((slot - 1) * REC, slot * REC);

  // express.e copies conferenceAccess with AstrCopy(..,10): at most nine
  // characters and a NUL (21334, 23792, 29369). Its checks use StrLen
  // (459-465, 8499-8512), which on ten unterminated bytes runs on into
  // `uploads` - so a caller with 256 uploads or more read as an access-AREA
  // name and lost every conference (byte-format audit, 2026-10-04).
  it('ends conferenceAccess with a NUL, so 300 uploads cannot change a caller\'s access', () => {
    mgr.writeUserFiles(user({ confAccess: 'XXXXXXXXXX', uploads: 300 }), 2);
    expect(record(2).subarray(136, 146).toString('latin1')).toBe('XXXXXXXXX\0');
  });

  it('writes a new account\'s conferenceAccess and expert the same way', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { UserDatabaseManager } = require('../../src/services/UserDatabaseManager');
    const udm = new UserDatabaseManager();
    const struct = udm.userToStruct(user({ expert: 'X' }));
    const bytes: Buffer = (udm as any).serializeUser(struct);
    expect(bytes.subarray(136, 146).toString('latin1')).toBe('XXXXXXXXX\0');
    expect(bytes[EXPERT]).toBe(0x58);
  });

  it('stores expert mode as the letter, and an "N" comes back as N', () => {
    mgr.writeUserFiles(user({ expert: 'N' }), 2);
    expect(String.fromCharCode(record(2)[EXPERT])).toBe('N');
    expect(mgr.readUserBySlot(2)!.expert).toBe('N');

    mgr.updateUserDataFile(user({ expert: 'X' }), 2);
    expect(String.fromCharCode(record(2)[EXPERT])).toBe('X');
    expect(mgr.readUserBySlot(2)!.expert).toBe('X');
  });

  it('reads the old writer\'s 1 as no answer, not as expert', () => {
    mgr.writeUserFiles(user(), 2);
    const file = path.join(root, 'user.data');
    const bytes = fs.readFileSync(file);
    bytes[REC + EXPERT] = 1;
    fs.writeFileSync(file, bytes);
    expect(mgr.readUserBySlot(2)!.expert).toBe('');
  });

  it('stores the caller\'s lines per screen, not 79', () => {
    mgr.writeUserFiles(user({ linesPerScreen: 23 }), 2);
    expect(record(2)[LINE_LENGTH]).toBe(23);
  });

  it('keeps the post count on disk when the User written has none (a database row)', () => {
    mgr.writeUserFiles(user({ messagesPosted: 7 }), 2);
    const fromRow = user();
    delete (fromRow as Partial<User>).messagesPosted;

    mgr.updateUserDataFile(fromRow, 2);

    expect(mgr.readUserBySlot(2)!.messagesPosted).toBe(7);
    // A User that does carry one still sets it.
    mgr.updateUserDataFile(user({ messagesPosted: 9 }), 2);
    expect(mgr.readUserBySlot(2)!.messagesPosted).toBe(9);
  });

  it('marks a deleted account in the record at its own position, and a row write keeps it deleted', () => {
    mgr.writeUserFiles(user(), 2);
    mgr.updateUserDataFile(user({ accountDeleted: true }), 2);

    expect(record(2).readInt16BE(SLOT_FIELD)).toBe(0);
    expect(record(2).subarray(0, 9).toString('latin1')).toBe('roundtrip');
    expect(mgr.readUserBySlot(2)!.accountDeleted).toBe(true);

    // A User from the database row says nothing about deletion.
    mgr.updateUserDataFile(user(), 2);
    expect(mgr.readUserBySlot(2)!.accountDeleted).toBe(true);

    // Re-activate (express.e:21374-21378) puts the position back in the field.
    mgr.updateUserDataFile(user({ accountDeleted: false }), 2);
    expect(record(2).readInt16BE(SLOT_FIELD)).toBe(2);
    expect(mgr.readUserBySlot(2)!.accountDeleted).toBe(false);
  });
});
