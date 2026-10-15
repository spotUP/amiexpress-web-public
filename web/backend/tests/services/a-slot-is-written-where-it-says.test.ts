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
import { setBoardRoot } from '../helpers/board-root';

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
  const restore = setBoardRoot(root);
  try { return { root, mgr: new UserFileManager() }; }
  finally { restore(); }
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

/**
 * The regeneration script is DRIVEN: it runs on import, so the test hands it
 * a fake Database (getUsers returns accounts in an order that is NOT their
 * slot order) and a recording userFileManager, stops process.exit, and reads
 * which slot each account was written to.
 */
describe('the regeneration script', () => {
  async function runScript(users: Array<Record<string, unknown>>) {
    const writes: Array<[string, number]> = [];
    const updates: Array<[string, unknown]> = [];
    let exited!: () => void;
    const done = new Promise<void>((resolve) => { exited = resolve; });
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      exited();
      return undefined as never;
    }) as never);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      jest.isolateModules(() => {
        jest.doMock('../../src/database', () => ({
          Database: class {
            async init() { /* no DB */ }
            async getUsers() { return users; }
            async updateUser(id: string, fields: unknown) { updates.push([id, fields]); }
          },
        }));
        jest.doMock('../../src/services/UserFileManager', () => ({
          userFileManager: {
            initializeUserFiles: () => undefined,
            writeUserFiles: (u: { username: string }, slot: number) => { writes.push([u.username, slot]); },
          },
        }));
        require('../../src/scripts/regenerate-user-files');
      });
      await done;
      return { writes, updates, exitCode: exitSpy.mock.calls[0]?.[0] };
    } finally {
      exitSpy.mockRestore();
      logSpy.mockRestore();
      jest.dontMock('../../src/database');
      jest.dontMock('../../src/services/UserFileManager');
    }
  }

  it('keeps each account on the slot it already has', async () => {
    // Query order dalton, coffe - the order that used to renumber them 1, 2.
    const { writes, updates, exitCode } = await runScript([
      { id: 'd', username: 'dalton', slotNumber: 14 },
      { id: 'c', username: 'coffe', slotNumber: 13 },
    ]);
    expect(exitCode).toBe(0);
    expect(writes).toEqual([['dalton', 14], ['coffe', 13]]);
    expect(updates).toEqual([]);
  });

  it('gives an account with no slot the first free one, and records it', async () => {
    const { writes, updates } = await runScript([
      { id: 'n', username: 'newbie', slotNumber: null },
      { id: 'a', username: 'sysop', slotNumber: 1 },
      { id: 'b', username: 'coffe', slotNumber: 2 },
    ]);
    expect(writes).toEqual([['newbie', 3], ['sysop', 1], ['coffe', 2]]);
    expect(updates).toEqual([['n', { slotNumber: 3 }]]);
  });
});
