/**
 * THE USER DUPLICATION, from the start of this project.
 *
 * user.data, user.keys and user.misc are arrays indexed by SLOT: record N is
 * slot N+1, and every read computes its offset that way. writeUserFiles took
 * a slot number and then APPENDED - the slot was accepted and ignored, so
 * each write added a record at the end instead of replacing the one it
 * named. Write a user twice and the file holds two of them, the second at a
 * position that is somebody else's slot.
 *
 * The live board carried 46 accounts in 100 populated records, and a lockout
 * written "at coffe's slot" sat on dalton, one slot along (2026-09-13).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { UserFileManager } from '../../src/services/UserFileManager';
import type { User } from '../../src/database';

process.env.SKIP_DB_INIT = '1';

const REC = 232;

function dbUser(username: string): User {
  return {
    id: `id-${username}`, username, realname: username, location: 'nowhere', phone: '000',
    secLevel: 30, slotNumber: 1, uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0,
    timeTotal: 0, timeLimit: 60, timeUsed: 0, calls: 1, callsToday: 1, expert: false,
    ansi: true, linesPerScreen: 23, confAccess: 'X-------------------------',
    created: new Date('2026-01-01T00:00:00Z'), updated: new Date('2026-01-01T00:00:00Z'),
    lastLogin: new Date('2026-01-01T00:00:00Z'),
  } as unknown as User;
}

function board(): { root: string; mgr: UserFileManager } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slots-'));
  const saved = process.env.BBS_DATA_DIR;
  process.env.BBS_DATA_DIR = root;
  try { return { root, mgr: new UserFileManager() }; }
  finally {
    if (saved === undefined) delete process.env.BBS_DATA_DIR;
    else process.env.BBS_DATA_DIR = saved;
  }
}

/** Every populated name in user.data, by record. */
function namesOnDisk(root: string): Array<{ slot: number; name: string }> {
  const d = fs.readFileSync(path.join(root, 'user.data'));
  const out: Array<{ slot: number; name: string }> = [];
  for (let i = 0; i * REC < d.length; i++) {
    const name = d.subarray(i * REC, i * REC + 31).toString('latin1').split('\0')[0]!.trim();
    if (name) out.push({ slot: i + 1, name });
  }
  return out;
}

describe('a user written twice', () => {
  const roots: string[] = [];
  afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

  it('occupies ONE record, not two', () => {
    const { root, mgr } = board();
    roots.push(root);

    mgr.writeUserFiles(dbUser('coffe'), 13);
    mgr.writeUserFiles(dbUser('coffe'), 13);

    expect(namesOnDisk(root)).toEqual([{ slot: 13, name: 'coffe' }]);
  });

  it('lands on the slot it was given, so a neighbour is untouched', () => {
    const { root, mgr } = board();
    roots.push(root);

    mgr.writeUserFiles(dbUser('coffe'), 13);
    mgr.writeUserFiles(dbUser('dalton'), 14);
    // A rewrite of the earlier account must not shift the later one.
    mgr.writeUserFiles(dbUser('coffe'), 13);

    expect(namesOnDisk(root)).toEqual([
      { slot: 13, name: 'coffe' },
      { slot: 14, name: 'dalton' },
    ]);
  });

  it('reads back from the slot it was written to', () => {
    const { root, mgr } = board();
    roots.push(root);

    mgr.writeUserFiles(dbUser('coffe'), 13);
    mgr.writeUserFiles(dbUser('dalton'), 14);

    expect(mgr.readUserBySlot(13)?.username).toBe('coffe');
    expect(mgr.readUserBySlot(14)?.username).toBe('dalton');
  });

  it('refuses a slot that is not one, rather than appending somewhere', () => {
    const { root, mgr } = board();
    roots.push(root);
    expect(() => mgr.writeUserFiles(dbUser('nobody'), 0)).toThrow(/invalid slot/);
    expect(() => mgr.writeUserFiles(dbUser('nobody'), -1)).toThrow(/invalid slot/);
  });
});

describe('the regeneration script', () => {
  it('keeps each account on the slot it already has', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/scripts/regenerate-user-files.ts'), 'utf8');
    // The shape that renumbered everyone by query order.
    expect(src).not.toMatch(/const slot = i \+ 1;/);
    expect(src).toContain('if (Number.isInteger(u.slotNumber) && u.slotNumber > 0) return u.slotNumber;');
  });
});
