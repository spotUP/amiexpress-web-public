// @ts-nocheck
/**
 * SAVING AN EXISTING ACCOUNT WRITES THE FIELDS THE CALLER NAMES AND NO OTHER BYTE.
 *
 * A User built from a database row used to rebuild the whole on-disk record:
 * on record 1 of tests/fixtures/amiga-board/User.data the password field
 * "Pass---8" went empty, confRJoin 0 became 1, timeLastOn was stamped and the
 * invalid expert byte 'A' became 'N'. AmiExpress and its doors read the disk
 * record, so each of those was a change nobody asked for.
 *
 * Every test compares WHOLE buffers of user.data, user.keys and user.misc.
 */
import * as fs from 'fs';
import * as path from 'path';

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'amiga-board');
process.env.SKIP_DB_INIT = '1';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { UserFileManager, userFileManager } = require('../../src/services/UserFileManager');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadAccount, changedRecordFields, fieldsDifferingFrom } = require('../../src/services/load-account');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { applyUserEditsToDisk } = require('../../src/api/user-edits-to-disk');

// The run's own board (jest setup points boardRoot() at it); the fixture files replace its user files per test.
const ROOT = path.dirname(userFileManager.userFilePaths().data);
const FILES = ['user.data', 'user.keys', 'user.misc'];
const file = (name: string) => path.join(ROOT, name);

function freshBoard() {
  fs.copyFileSync(path.join(FIXTURES, 'User.data'), file('user.data'));
  fs.copyFileSync(path.join(FIXTURES, 'User.keys'), file('user.keys'));
  fs.copyFileSync(path.join(FIXTURES, 'user.misc'), file('user.misc'));
}

const snapshot = () => FILES.map(f => fs.readFileSync(file(f)));

/** Indexes at which two buffers differ. */
function changedBytes(a: Buffer, b: Buffer): number[] {
  expect(b.length).toBe(a.length);
  const out: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) out.push(i);
  return out;
}

/** The bytes user.data's record 1 changes when ONLY secStatus changes - what a one-field save may touch. */
function secStatusBytes(before: Buffer, secStatus: number): number[] {
  const m = new UserFileManager(ROOT);
  const rec = m.deserializeUserStruct(before, 0);
  const a = m.serializeUserStruct(rec);
  const b = m.serializeUserStruct({ ...rec, secStatus });
  return changedBytes(a, b);
}

/** A row as the users table holds it for record 1: no password field in the record, 'N' for expert, no last logon. */
function rowForRecord1() {
  const disk = userFileManager.readUserBySlot(1);
  return { ...disk, id: 'row-1', slotNumber: 1, passwordHash: '$2b$10$hash', expert: 'N', autoRejoin: 1, confRJoin: 1, lastLogin: undefined };
}

beforeEach(freshBoard);

test('the fixture record carries what the old rebuild destroyed', () => {
  const m = new UserFileManager(ROOT);
  const rec = m.deserializeUserStruct(fs.readFileSync(file('user.data')), 0);
  expect(rec.pass).toBe('Pass---8');
  expect(rec.confRJoin).toBe(0);
  expect(rec.expert).toBe(65); // 'A', neither X nor N
  expect(rec.timeLastOn).toBe(0);
});

describe('caller class: a save that names fields (BBS door save, sysop edit, account editor)', () => {
  test('naming secLevel changes that field and not one other byte of the three files', () => {
    const before = snapshot();
    userFileManager.updateUserDataFile({ secLevel: 77 }, 1);
    const after = snapshot();
    expect(changedBytes(before[0], after[0]).filter(i => i < 232).every(i => secStatusBytes(before[0], 77).includes(i))).toBe(true);
    expect(changedBytes(before[0], after[0]).length).toBeGreaterThan(0);
    expect(changedBytes(before[0].subarray(232), after[0].subarray(232))).toEqual([]); // record 2
    expect(after[1].equals(before[1])).toBe(true);
    expect(after[2].equals(before[2])).toBe(true);
    expect(userFileManager.readUserBySlot(1).secLevel).toBe(77);
  });

  test('a User field that is undefined is not named: password, rejoin, last logon and expert byte stay', () => {
    const before = snapshot();
    userFileManager.updateUserDataFile({ username: undefined, secLevel: undefined, expert: undefined, confRJoin: undefined, lastLogin: undefined }, 1);
    const after = snapshot();
    for (let i = 0; i < 3; i++) expect(after[i].equals(before[i])).toBe(true);
  });

  test('a changed password is not written either: no User field maps to the credential', () => {
    const before = snapshot();
    userFileManager.updateUserDataFile({ passwordHash: 'new-hash', pwdLastUpdated: undefined }, 1);
    for (let i = 0; i < 3; i++) expect(snapshot()[i].equals(before[i])).toBe(true);
  });
});

describe('caller class: a whole account saved from a database row (db.updateUser, saveAccount)', () => {
  test('an account that loaded from the row and changed nothing writes nothing', () => {
    const row = rowForRecord1();
    const { user } = loadAccount(row);
    const before = snapshot();
    userFileManager.updateUserDataFile(changedRecordFields(user, row), 1);
    const after = snapshot();
    for (let i = 0; i < 3; i++) expect(after[i].equals(before[i])).toBe(true);
    const rec = new UserFileManager(ROOT).deserializeUserStruct(after[0], 0);
    expect(rec.pass).toBe('Pass---8');
    expect(rec.confRJoin).toBe(0);
    expect(rec.expert).toBe(65);
    expect(rec.timeLastOn).toBe(0);
  });

  test('the same account with one field changed writes that field alone', () => {
    const row = rowForRecord1();
    const { user } = loadAccount(row);
    user.secLevel = 33;
    const before = snapshot();
    userFileManager.updateUserDataFile(changedRecordFields(user, row), 1);
    const after = snapshot();
    expect(changedBytes(before[0], after[0]).every(i => secStatusBytes(before[0], 33).includes(i))).toBe(true);
    expect(after[1].equals(before[1])).toBe(true);
    expect(after[2].equals(before[2])).toBe(true);
    expect(userFileManager.readUserBySlot(1).secLevel).toBe(33);
  });

  test('db.updateUser(id, { secLevel }) writes the level alone, whatever the row spells for the rest', () => {
    const row = rowForRecord1();
    const before = snapshot();
    userFileManager.updateUserDataFile(changedRecordFields({ secLevel: 21 }, row), 1);
    const after = snapshot();
    expect(changedBytes(before[0], after[0]).every(i => secStatusBytes(before[0], 21).includes(i))).toBe(true);
    expect(after[1].equals(before[1])).toBe(true);
    expect(after[2].equals(before[2])).toBe(true);
  });
});

describe('caller class: the admin form (config-routes PUT /users/user-N)', () => {
  test('a form edit of one field writes that field, though the disk view is lossy (expert byte)', () => {
    const current = userFileManager.readUserBySlot(1);
    const updated = { ...current, realname: 'Someone Else' };
    const before = snapshot();
    userFileManager.updateUserDataFile(fieldsDifferingFrom(updated, current), 1);
    const after = snapshot();
    expect(after[0].equals(before[0])).toBe(true);
    expect(after[1].equals(before[1])).toBe(true);
    expect(changedBytes(before[2], after[2]).length).toBeGreaterThan(0);
    expect(changedBytes(before[2], after[2]).every(i => i < 248)).toBe(true); // record 1 only
    expect(userFileManager.readUserBySlot(1).realname).toBe('Someone Else');
  });
});

describe('caller class: applyUserEditsToDisk (the admin account page)', () => {
  test('an edit of the level changes the level, never the password field, rejoin or expert byte', () => {
    const name = userFileManager.readUserBySlot(1).username;
    const before = snapshot();
    const outcome = applyUserEditsToDisk(name, { secLevel: 55 });
    expect(outcome.applied).toEqual(['secLevel']);
    const after = snapshot();
    expect(changedBytes(before[0], after[0]).every(i => secStatusBytes(before[0], 55).includes(i))).toBe(true);
    expect(after[1].equals(before[1])).toBe(true);
    expect(after[2].equals(before[2])).toBe(true);
  });
});

describe('caller class: the bulk account editor (user-editor.handler writeBulkAccount)', () => {
  test('a record built from the disk view and changed in one field writes that field', () => {
    const onDisk = userFileManager.readUserBySlot(1);
    const user = { ...onDisk, timeLimit: 4321 };
    const before = snapshot();
    userFileManager.updateUserDataFile(fieldsDifferingFrom(user, onDisk), 1);
    const after = snapshot();
    expect(after[1].equals(before[1])).toBe(true);
    expect(after[2].equals(before[2])).toBe(true);
    expect(userFileManager.readUserBySlot(1).timeLimit).toBe(4321);
    expect(new UserFileManager(ROOT).deserializeUserStruct(after[0], 0).expert).toBe(65);
  });
});

describe('a NEW record starts from the new-account values', () => {
  test('a slot with no account gets a whole record, protocol Z, from the User', () => {
    const m = new UserFileManager(ROOT);
    const user = { ...userFileManager.readUserBySlot(1), username: 'Brand New', slotNumber: 3, expert: 'N' };
    userFileManager.updateUserDataFile(user, 3);
    const rec = m.deserializeUserStruct(fs.readFileSync(file('user.data')), 2 * 232);
    expect(rec.name).toBe('Brand New');
    expect(rec.protocol).toBe(0x5a);
    expect(rec.expert).toBe(0x4e);
  });
});
