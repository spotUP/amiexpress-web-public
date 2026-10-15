// @ts-nocheck
/**
 * A DOOR SEES loggedOnUser: THE DISK RECORD AS LOADED, PLUS WHAT THE SESSION CHANGED.
 *
 * node<n>.user and the XIM loadAccount buffer were built whole from a User, so
 * a door saw an empty password and the row's default confRJoin. They now start
 * from the slot's bytes and overlay only the session's changes (sessionRecords,
 * the same overlay a save uses).
 *
 * Reachability: NodeFileManager.writeNodeUserFile (the node file written at
 * logon) is driven below; the XIM handler calls the same sessionRecords.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'amiga-board');
process.env.SKIP_DB_INIT = '1';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { userFileManager } = require('../../src/services/UserFileManager');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadAccount, sessionRecords } = require('../../src/services/load-account');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { NodeFileManager } = require('../../src/services/NodeFileManager');

const ROOT = path.dirname(userFileManager.userFilePaths().data);
const file = (n: string) => path.join(ROOT, n);

beforeEach(() => {
  fs.copyFileSync(path.join(FIXTURES, 'User.data'), file('user.data'));
  fs.copyFileSync(path.join(FIXTURES, 'User.keys'), file('user.keys'));
  fs.copyFileSync(path.join(FIXTURES, 'user.misc'), file('user.misc'));
});

/** The session's account as logon builds it: a row (no password in the record, defaults) merged over the record. */
function sessionUser() {
  const disk = userFileManager.readUserBySlot(1);
  const row = { ...disk, id: 'row-1', slotNumber: 1, passwordHash: '$2b$10$hash', expert: 'N', autoRejoin: 1, confRJoin: 1, lastLogin: undefined };
  return loadAccount(row).user;
}

const diskSlot1 = () => fs.readFileSync(file('user.data')).subarray(0, 232);
const keysSlot1 = () => fs.readFileSync(file('user.keys')).subarray(0, 56);

test('an unchanged session shows the door the record byte for byte (password and rejoin intact)', () => {
  const rec = sessionRecords(sessionUser(), 1);
  expect(Buffer.compare(rec.user, diskSlot1())).toBe(0);
  expect(Buffer.compare(rec.keys, keysSlot1())).toBe(0);
  expect(rec.user.toString('latin1')).toContain('Pass---8');
});

test('a changed field is the only difference from the record', () => {
  const user = sessionUser();
  user.secLevel = 77;
  const rec = sessionRecords(user, 1);
  const differing: number[] = [];
  for (let i = 0; i < 232; i++) if (rec.user[i] !== diskSlot1()[i]) differing.push(i);
  expect(differing.length).toBeGreaterThan(0);
  expect(differing.length).toBeLessThanOrEqual(2);
  expect(userFileManager.deserializeUserStruct(rec.user, 0).secStatus).toBe(77);
  expect(Buffer.compare(rec.keys, keysSlot1())).toBe(0);
});

test('node<n>.user, as written at logon, is the record plus the session changes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-'));
  const user = sessionUser();
  new NodeFileManager(dir).writeNodeUserFile(3, user);
  expect(Buffer.compare(fs.readFileSync(path.join(dir, 'node3.user')), diskSlot1())).toBe(0);
  fs.rmSync(dir, { recursive: true });
});

test('a slot with no record of the caller falls back to a whole record', () => {
  const user = { ...sessionUser(), username: 'Nobody Here', slotNumber: 1 };
  const rec = sessionRecords(user, 1);
  expect(userFileManager.deserializeUserStruct(rec.user, 0).name).toBe('Nobody Here');
});
