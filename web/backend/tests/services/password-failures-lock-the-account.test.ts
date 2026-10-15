/**
 * A wrong password counts against the ACCOUNT, and enough of them lock it.
 *
 * express.e:1008-1016, in the password check itself:
 *
 *     userMisc.invalidAttempts := userMisc.invalidAttempts + 1
 *     maxAttempts := readToolTypeInt(..., 'MAX_PASSWORD_FAILS')
 *     IF maxAttempts >= 0
 *       IF userMisc.invalidAttempts >= maxAttempts
 *         userMisc.accountLocked := TRUE
 *         userMisc.invalidAttempts := 0
 *
 * and the ELSE of that same comparison zeroes the counter on success.
 *
 * This port counted password failures in the SESSION. `user.misc` carried an
 * `invalidAttempts` field that was read, displayed in the account editor, and
 * never incremented by anything - so `accountLocked`, which login already
 * honours (`login-post.service.ts`, express.e:29775-29782), could only ever be
 * set by a sysop editing the account by hand. The lockout gate was real code
 * that nothing could trip, and a caller escaped the count by hanging up.
 *
 * These drive the real manager against a temporary board and read the bytes
 * back out of user.misc, because the bug was that nothing reached the bytes.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function freshManager(dataDir: string) {
  const previous = { ...process.env };
  delete process.env.BBS_ROOT;
  process.env.BBS_DATA_DIR = dataDir;

  jest.resetModules();
  // The paths are resolved in the constructor, and the module exports a
  // singleton built at import time.
  const { UserDatabaseManager } = require('../../src/services/UserDatabaseManager');
  const { UserFileManager } = require('../../src/services/UserFileManager');
  const manager = new UserDatabaseManager();
  const writer = new UserFileManager();

  process.env = previous;
  return { manager, writer };
}

function boardWithUsers(dataDir: string) {
  const { manager, writer } = freshManager(dataDir);
  manager.initializeUserDatabase();
  // Two users. Slots are 1-indexed like express.e (slot 0 is a deleted
  // account - deleting a user sets `slotNumber := 0`, express.e:21365, and
  // login refuses it with "That account has been deleted.", express.e:29701).
  ['sysop', 'spot'].forEach((username, i) => {
    writer.writeUserFiles({ username, realname: username, location: 'Uprough', secLevel: 255 }, i + 1);
  });
  return manager;
}

/** The second record: a real, non-deleted account. */
const SLOT = 2;

describe('a wrong password, counted where express counts it', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-pwdfail-'));
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('increments invalidAttempts in user.misc, which nothing did before', () => {
    const manager = boardWithUsers(dataDir);

    manager.recordPasswordFailure(SLOT, 3);

    expect(manager.readUserFromDisk(SLOT).misc.invalidAttempts).toBe(1);
  });

  it('locks the account on the failure that reaches the cap', () => {
    const manager = boardWithUsers(dataDir);

    expect(manager.recordPasswordFailure(SLOT, 3)).toBe(false);
    expect(manager.recordPasswordFailure(SLOT, 3)).toBe(false);
    expect(manager.recordPasswordFailure(SLOT, 3)).toBe(true);

    expect(manager.readUserFromDisk(SLOT).misc.accountLocked).toBeTruthy();
  });

  it('zeroes the counter as it locks, so unlocking does not leave it primed', () => {
    // express.e:1015 - invalidAttempts := 0 on the same branch that locks.
    const manager = boardWithUsers(dataDir);

    manager.recordPasswordFailure(SLOT, 1);

    const misc = manager.readUserFromDisk(SLOT).misc;
    expect(misc.accountLocked).toBeTruthy();
    expect(misc.invalidAttempts).toBe(0);
  });

  it('never locks when the board sets no cap, which is the default board', () => {
    // `readToolTypeInt` returns -1 for an absent tooltype (tooltypes.e:181) and
    // express gates the whole lockout behind `maxAttempts >= 0`. A board with
    // no MAX_PASSWORD_FAILS therefore never locks anyone out, and this port's
    // -1 default is that behaviour, not a missing setting.
    const manager = boardWithUsers(dataDir);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(manager.recordPasswordFailure(SLOT, -1)).toBe(false);
    }

    const misc = manager.readUserFromDisk(SLOT).misc;
    expect(misc.accountLocked).toBeFalsy();
    expect(misc.invalidAttempts).toBe(10);
  });

  it('clears the count on a correct password', () => {
    // express.e:1018 - the ELSE branch of the same comparison.
    const manager = boardWithUsers(dataDir);
    manager.recordPasswordFailure(SLOT, 5);
    manager.recordPasswordFailure(SLOT, 5);

    manager.clearPasswordFailures(SLOT);

    expect(manager.readUserFromDisk(SLOT).misc.invalidAttempts).toBe(0);
  });

  it('leaves the rest of the misc record alone', () => {
    // The record is written back whole, so a bug here would quietly corrupt
    // pwdLastUpdated or forcePwdReset for every caller who mistypes.
    const manager = boardWithUsers(dataDir);
    const before = manager.readUserFromDisk(SLOT).misc;

    manager.recordPasswordFailure(SLOT, 5);

    const after = manager.readUserFromDisk(SLOT).misc;
    expect(after.pwdLastUpdated).toBe(before.pwdLastUpdated);
    expect(after.forcePwdReset).toBe(before.forcePwdReset);
  });

  it('does not throw when the slot has no misc record', () => {
    const { manager } = freshManager(dataDir);
    manager.initializeUserDatabase();

    expect(() => manager.recordPasswordFailure(99, 3)).not.toThrow();
    expect(manager.recordPasswordFailure(99, 3)).toBe(false);
  });

  it("writes the caller's own record, not the neighbour's", () => {
    // The bug this guards: records were addressed `slot * SIZE` while every
    // caller passes 1-indexed slots, so one caller's typos locked the next
    // account down - and unlocking never helped, because the gate read a
    // different record than the one the failures wrote. Two accounts with
    // different counts tell them apart with no layout hardcoding.
    const manager = boardWithUsers(dataDir);

    manager.recordPasswordFailure(2, 5);
    manager.recordPasswordFailure(1, 5);
    manager.recordPasswordFailure(1, 5);

    expect(manager.readUserFromDisk(2).misc.invalidAttempts).toBe(1);
    expect(manager.readUserFromDisk(1).misc.invalidAttempts).toBe(2);
  });

  it('findUserSlotByName returns the 1-indexed slot', () => {
    const manager = boardWithUsers(dataDir);

    expect(manager.findUserSlotByName('spot')).toBe(2);
    expect(manager.findUserSlotByName('SPOT')).toBe(2);
    expect(manager.findUserSlotByName('nobody')).toBe(-1);
  });
});
