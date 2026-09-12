/**
 * The lockout bytes survive a login sync, and the admin can see them.
 *
 * Two bugs, one file. user.misc holds accountLocked / invalidAttempts /
 * forcePwdReset (express.e userMisc, axobjects.e:93-95), and every login
 * rewrites the caller's record through updateUserDataFile - whose misc
 * builder hardcoded all three to zero. So a locked account was silently
 * unlocked on each login, and each admin edit did the same: the state the
 * gate reads could never survive the sync that runs before the gate.
 *
 * The other direction held too: fileStructsToUser never copied the fields
 * onto User, so GET /api/config/users carried no lockout data and no admin
 * surface could show a lock, a fail count, or an unlock button - the exact
 * report that started this ("a user failed to enter his password and got
 * locked out, but i can't see any sign of that in the web admin ui").
 *
 * Rules, per express.e: the password check increments, success zeroes
 * (:1008-1018); only the check, an explicit unlock, or a sysop edit may
 * change the bytes. A User synced from the database carries no lock fields
 * and must not disturb them; explicit numbers (BBS editor B/C/D, admin
 * unlock) win.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { UserFileManager } from '../../src/services/UserFileManager';
import type { User } from '../../src/database';

process.env.SKIP_DB_INIT = '1';

const MISC_REC = 248;
// Record-relative offsets of the three lockout CHARs, verified against the
// live board (slot 14 dalton: locked=1 at +0x94, attempts=2 at +0x95) and
// matching deserializeUserMiscStruct's field order.
const OFF_RESET = 0x93;
const OFF_LOCKED = 0x94;
const OFF_ATTEMPTS = 0x95;

/** A database-shaped account: the sync path carries no lock fields. */
function dbUser(username: string): User {
  return {
    id: `id-${username}`,
    username,
    realname: username,
    location: 'nowhere',
    phone: '000',
    secLevel: 30,
    slotNumber: 1,
    uploads: 0,
    downloads: 0,
    bytesUpload: 0,
    bytesDownload: 0,
    timeTotal: 0,
    timeLimit: 60,
    timeUsed: 0,
    calls: 1,
    callsToday: 1,
    expert: false,
    ansi: true,
    linesPerScreen: 23,
    confAccess: 'X-------------------------',
    created: new Date('2026-01-01T00:00:00Z'),
    updated: new Date('2026-01-01T00:00:00Z'),
    lastLogin: new Date('2026-01-01T00:00:00Z'),
  } as unknown as User;
}

function boardWithManager(): { root: string; mgr: UserFileManager } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'userlock-'));
  const saved = process.env.BBS_DATA_DIR;
  process.env.BBS_DATA_DIR = root;
  try {
    return { root, mgr: new UserFileManager() };
  } finally {
    if (saved === undefined) delete process.env.BBS_DATA_DIR;
    else process.env.BBS_DATA_DIR = saved;
  }
}

/** Raw lockout bytes for slot 1, straight out of user.misc. */
function lockBytes(root: string): [number, number, number] {
  const d = fs.readFileSync(path.join(root, 'user.misc'));
  return [d[OFF_RESET], d[OFF_LOCKED], d[OFF_ATTEMPTS]];
}

describe('the lockout bytes survive a login sync', () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
  });

  it('a database sync preserves a lock it was not told to change', () => {
    const { root, mgr } = boardWithManager();
    roots.push(root);

    // The lock, as the password check would leave it.
    mgr.updateUserDataFile({ ...dbUser('dalton'), accountLocked: 1, invalidAttempts: 0 } as User, 1);
    expect(lockBytes(root)).toEqual([0, 1, 0]);

    // The login sync: a User with no lock fields, as the database holds it.
    mgr.updateUserDataFile(dbUser('dalton'), 1);

    expect(lockBytes(root)).toEqual([0, 1, 0]);
    const read = mgr.readUserBySlot(1)!;
    expect(read.accountLocked).toBe(1);
    expect(read.invalidAttempts).toBe(0);
  });

  it('a database sync preserves a running failure count', () => {
    const { root, mgr } = boardWithManager();
    roots.push(root);

    mgr.updateUserDataFile({ ...dbUser('dalton'), invalidAttempts: 2 } as User, 1);
    mgr.updateUserDataFile(dbUser('dalton'), 1);

    expect(lockBytes(root)).toEqual([0, 0, 2]);
  });

  it('explicit numbers still win - the unlock path', () => {
    const { root, mgr } = boardWithManager();
    roots.push(root);

    mgr.updateUserDataFile({ ...dbUser('dalton'), accountLocked: 1, invalidAttempts: 0 } as User, 1);
    // The admin unlock button / BBS editor C+D: explicit zeroes.
    mgr.updateUserDataFile({ ...dbUser('dalton'), accountLocked: 0, invalidAttempts: 0 } as User, 1);

    expect(lockBytes(root)).toEqual([0, 0, 0]);
  });

  it('a fresh record starts unlocked - preserve reads absence as zero', () => {
    const { root, mgr } = boardWithManager();
    roots.push(root);

    mgr.updateUserDataFile(dbUser('newbie'), 1);

    expect(lockBytes(root)).toEqual([0, 0, 0]);
  });
});

describe('the admin can see the lockout state', () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
  });

  it('readAllUsers carries the misc lockout fields', () => {
    const { root, mgr } = boardWithManager();
    roots.push(root);

    mgr.updateUserDataFile({ ...dbUser('dalton'), accountLocked: 1, invalidAttempts: 2 } as User, 1);

    const [listed] = mgr.readAllUsers();
    expect(listed.username).toBe('dalton');
    expect(listed.accountLocked).toBe(1);
    expect(listed.invalidAttempts).toBe(2);
  });
});
