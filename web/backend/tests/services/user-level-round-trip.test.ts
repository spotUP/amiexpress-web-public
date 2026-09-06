/**
 * A user's security level, between `user.data` and the SQL mirror.
 *
 * Two separate things are pinned here, and they point in opposite directions.
 *
 * 1. ROUND-TRIP. `updateUserDataFile` must put `user.secLevel` into the
 *    232-byte record's `secStatus` field - a big-endian INT at byte 86 - and
 *    `readUserBySlot` must read the same number back. This is the fidelity
 *    pin: an offset or a width that drifts by two bytes reads the neighbouring
 *    field, and a sysop at 255 quietly becomes a caller at 0. It is proved
 *    against the raw bytes, not just against the reader, because a matching
 *    pair of writer and reader bugs cancels out.
 *
 * 2. DIRECTION. The login path (`server/auth-socket-handlers.ts`, the "Sync
 *    user to disk files for 68K door compatibility" block) reads the account
 *    out of SQL and then calls `updateUserDataFile`. So at login SQL WINS and
 *    the disk record is overwritten - including its security level. If the
 *    two ever disagree, the disk value is the one that dies, silently, on the
 *    next login. That is the opposite of this project's stated rule that disk
 *    is the source of truth and SQL is a mirror, and it is pinned here as
 *    CURRENT BEHAVIOUR so that changing it has to be deliberate rather than
 *    accidental.
 *
 * Everything runs on a temp board. `BBS_DATA_DIR` is set before the
 * UserFileManager is constructed, because the constructor resolves its three
 * paths once and never re-reads the environment.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { UserFileManager } from '../../src/services/UserFileManager';
import type { User } from '../../src/database';

const REC = 232;
const SEC_STATUS_OFFSET = 86;
const SLOT_OFFSET = 84;

/** A minimal account. Only the fields these assertions read are meaningful. */
function account(username: string, secLevel: number): User {
  return {
    id: `id-${username}`,
    username,
    realname: username,
    location: 'nowhere',
    phone: '000',
    secLevel,
    slotNumber: 0,
    uploads: 0,
    downloads: 0,
    bytesUpload: 0,
    bytesDownload: 0,
    timeTotal: 0,
    timeLimit: 0,
    timeUsed: 0,
    calls: 0,
    callsToday: 0,
    expert: false,
    ansi: true,
    linesPerScreen: 23,
    confAccess: 'X---------',
    created: new Date('2026-01-01T00:00:00Z'),
    updated: new Date('2026-01-01T00:00:00Z'),
    lastLogin: new Date('2026-01-01T00:00:00Z'),
  } as unknown as User;
}

function boardWithManager(): { root: string; mgr: UserFileManager } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'userlevel-'));
  const saved = process.env.BBS_DATA_DIR;
  process.env.BBS_DATA_DIR = root;
  try {
    return { root, mgr: new UserFileManager() };
  } finally {
    if (saved === undefined) delete process.env.BBS_DATA_DIR;
    else process.env.BBS_DATA_DIR = saved;
  }
}

/** Reads secStatus straight out of the file. Deliberately not the manager. */
function secStatusFromBytes(root: string, slot: number): number {
  const d = fs.readFileSync(path.join(root, 'user.data'));
  return d.readInt16BE((slot - 1) * REC + SEC_STATUS_OFFSET);
}

function slotFromBytes(root: string, slot: number): number {
  const d = fs.readFileSync(path.join(root, 'user.data'));
  return d.readInt16BE((slot - 1) * REC + SLOT_OFFSET);
}

function nameFromBytes(root: string, slot: number): string {
  const d = fs.readFileSync(path.join(root, 'user.data'));
  return d.toString('latin1', (slot - 1) * REC, (slot - 1) * REC + 31).split('\0')[0];
}

describe("a user's security level survives the trip to user.data and back", () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
  });

  it.each([0, 10, 20, 30, 100, 255])(
    'writes level %i to secStatus and reads the same number back',
    level => {
      const { root, mgr } = boardWithManager();
      roots.push(root);

      mgr.updateUserDataFile(account('roundtrip', level), 1);

      // The bytes themselves, at the offset a 68K door reads.
      expect(secStatusFromBytes(root, 1)).toBe(level);
      // And the manager's own reader agrees with them.
      expect(mgr.readUserBySlot(1)?.secLevel).toBe(level);
    }
  );

  it('keeps each slot\'s level to itself', () => {
    const { root, mgr } = boardWithManager();
    roots.push(root);

    mgr.updateUserDataFile(account('spotlike', 20), 1);
    mgr.updateUserDataFile(account('sysoplike', 255), 2);
    mgr.updateUserDataFile(account('callerlike', 10), 3);

    expect(secStatusFromBytes(root, 1)).toBe(20);
    expect(secStatusFromBytes(root, 2)).toBe(255);
    expect(secStatusFromBytes(root, 3)).toBe(10);
    expect(slotFromBytes(root, 2)).toBe(2);
    expect(nameFromBytes(root, 2)).toBe('sysoplike');

    // Rewriting slot 2 must not touch its neighbours.
    mgr.updateUserDataFile(account('sysoplike', 255), 2);
    expect(secStatusFromBytes(root, 1)).toBe(20);
    expect(secStatusFromBytes(root, 3)).toBe(10);
  });
});

describe('at login the database wins and the disk record is overwritten', () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
  });

  it('demotes a disk record whose level is higher than the database row says', () => {
    const { root, mgr } = boardWithManager();
    roots.push(root);

    // The board's disk truth: this account is level 20.
    mgr.updateUserDataFile(account('spot', 20), 1);
    expect(secStatusFromBytes(root, 1)).toBe(20);

    // The login path's sync, verbatim in shape: the User it hands over came
    // from `db.getUserByUsername`, so its secLevel is the SQL mirror's.
    mgr.updateUserDataFile(account('spot', 10), 1);

    // The disk value is gone. Nothing warned, nothing failed.
    expect(secStatusFromBytes(root, 1)).toBe(10);
    expect(mgr.readUserBySlot(1)?.secLevel).toBe(10);
  });

  it('leaves the disk record alone when the two already agree', () => {
    const { root, mgr } = boardWithManager();
    roots.push(root);

    mgr.updateUserDataFile(account('spot', 20), 1);
    const before = fs.readFileSync(path.join(root, 'user.data')).subarray(0, REC);

    mgr.updateUserDataFile(account('spot', 20), 1);
    const after = fs.readFileSync(path.join(root, 'user.data')).subarray(0, REC);

    expect(after.readInt16BE(SEC_STATUS_OFFSET)).toBe(before.readInt16BE(SEC_STATUS_OFFSET));
    expect(after.readInt16BE(SEC_STATUS_OFFSET)).toBe(20);
  });

  it('creates a record for an account that has none, rather than refusing', () => {
    // `krakken` is in SQL at slot 3 with no matching user.data record. This is
    // what the login path does with such an account: it pads the file out and
    // writes slot 3, over whatever happens to be sitting there.
    const { root, mgr } = boardWithManager();
    roots.push(root);

    mgr.updateUserDataFile(account('occupant', 10), 3);
    expect(nameFromBytes(root, 3)).toBe('occupant');

    mgr.updateUserDataFile(account('krakken', 30), 3);

    expect(nameFromBytes(root, 3)).toBe('krakken');
    expect(secStatusFromBytes(root, 3)).toBe(30);
    // Slots 1 and 2 were never written; the file was zero-padded up to slot 3.
    expect(fs.readFileSync(path.join(root, 'user.data')).length).toBe(3 * REC);
    expect(nameFromBytes(root, 1)).toBe('');
  });

  it('refuses a slot of 0 instead of writing over slot 1', () => {
    const { root, mgr } = boardWithManager();
    roots.push(root);

    mgr.updateUserDataFile(account('spot', 20), 1);
    expect(() => mgr.updateUserDataFile(account('nobody', 255), 0)).toThrow(/invalid slot/);
    expect(nameFromBytes(root, 1)).toBe('spot');
    expect(secStatusFromBytes(root, 1)).toBe(20);
  });
});
