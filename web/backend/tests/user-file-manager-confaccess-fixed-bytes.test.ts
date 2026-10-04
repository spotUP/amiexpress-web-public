/**
 * Regression: conferenceAccess[10] in the AmiExpress UserFileStruct is
 * a 10-byte access bitmap (each byte 'X' = access, '_' = no access),
 * NOT a C-style null-terminated string. All 10 positions are
 * meaningful flags.
 *
 * UserFileManager.writeString reserves byte N-1 for a null terminator,
 * which loses position 10's flag — a user granted access to confs
 * 1..10 would write 9 X's + null, and when read back via
 * readConfAccessFromDisk position 10 always shows as '_'.
 *
 * Bug surfaced 2026-05-20 during the live-vs-localhost confaccess
 * investigation. door.handler.ts now reads SQLite-first (commit
 * 731f63f20) so user-visible behaviour is correct, but the binary
 * write path needs the same parity fix so future binary readers (mtop,
 * other 68K doors, any tool that reads user.data directly) see the
 * full access map.
 *
 * DRIVEN: the real UserFileManager writes a user into a temp board, and
 * the test reads the bytes of user.data the way a 68K door would.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { UserFileManager } from '../src/services/UserFileManager';
import type { User } from '../src/database';

const REC = 232;

function user(username: string, confAccess: string): User {
  return {
    id: `id-${username}`, username, realname: 'Real Name', location: 'Somewhere', phone: '000',
    secLevel: 30, slotNumber: 1, uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0,
    timeTotal: 0, timeLimit: 60, timeUsed: 0, calls: 1, callsToday: 1, expert: false,
    ansi: true, linesPerScreen: 23, confAccess,
    created: new Date('2026-01-01T00:00:00Z'), updated: new Date('2026-01-01T00:00:00Z'),
    lastLogin: new Date('2026-01-01T00:00:00Z'),
  } as unknown as User;
}

describe('UserFileManager writes conferenceAccess as 10 fixed bytes (no null terminator carve-out)', () => {
  let root: string;
  let mgr: UserFileManager;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'confaccess-bytes-'));
    const saved = process.env.BBS_DATA_DIR;
    process.env.BBS_DATA_DIR = root;
    try { mgr = new UserFileManager(); } finally {
      if (saved === undefined) delete process.env.BBS_DATA_DIR; else process.env.BBS_DATA_DIR = saved;
    }
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  /** The raw user.data record for `slot`. */
  const record = (slot: number) => fs.readFileSync(path.join(root, 'user.data')).subarray((slot - 1) * REC, slot * REC);

  // REVISED 2026-10-04: express.e holds nine flags and a NUL (AstrCopy(..,10),
  // StrLen checks) - ten unterminated bytes ran into `uploads`. See
  // tests/services/the-user-record-round-trips.test.ts.
  test('nine access flags reach the disk, then the NUL express.e reads up to', () => {
    mgr.writeUserFiles(user('tenconfs', 'XXXXXXXXXX'), 3);

    const at = mgr.conferenceAccessOffset();
    expect(record(3).subarray(at, at + 10).toString('latin1')).toBe('XXXXXXXXX\0');
  });

  test('a mixed map keeps its first nine positions, and reads back the same', () => {
    mgr.writeUserFiles(user('mixed', 'X_X_X_X_XX'), 2);

    const at = mgr.conferenceAccessOffset();
    expect(record(2).subarray(at, at + 10).toString('latin1')).toBe('X_X_X_X_X\0');
    expect(mgr.readUserBySlot(2)?.confAccess).toBe('X_X_X_X_X');
  });

  test('a string field keeps its null terminator (name[31] holds at most 30 characters)', () => {
    // Other string fields are C-style; the fixed-byte path is for the map only.
    mgr.writeUserFiles(user('N'.repeat(40), 'XXXXXXXXXX'), 1);

    const name = record(1).subarray(0, 31);
    expect(name.subarray(0, 30).toString('latin1')).toBe('N'.repeat(30));
    expect(name[30]).toBe(0);
  });
});
