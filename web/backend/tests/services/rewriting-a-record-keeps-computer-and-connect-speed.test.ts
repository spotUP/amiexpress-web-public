// @ts-nocheck
/**
 * REWRITING AN EXISTING ACCOUNT KEEPS ITS COMPUTER INDEX, CONNECT SPEED AND PROTOCOL BYTE.
 *
 * user.data secBulletin (express.e:11344) and user.keys baud (30269) used to be
 * written as 0 and 57600 on every save, whatever the record held. A User built
 * from a database row carries neither, so its save must leave the record's own.
 * Uses a real record: tests/fixtures/amiga-board/User.data.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { UserFileManager } from '../../src/services/UserFileManager';

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'amiga-board', 'User.data');

function board() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rewrite-'));
  const m = new UserFileManager(root);
  const data = fs.readFileSync(FIXTURE);
  // The fixture's record 1 with a computer index and a connect speed of its own.
  const rec = m.deserializeUserStruct(data, 0);
  rec.secBulletin = 5;
  fs.writeFileSync(path.join(root, 'user.data'), Buffer.concat([m.serializeUserStruct(rec), data.subarray(232)]));
  const keys = m.deserializeUserKeysStruct(Buffer.alloc(m.USERKEYS_STRUCT_SIZE), 0);
  keys.userName = rec.name; keys.number = 1; keys.baud = 9600;
  const k = m.serializeUserKeysStruct(keys);
  fs.writeFileSync(path.join(root, 'user.keys'), Buffer.concat([k, Buffer.alloc(m.USERKEYS_STRUCT_SIZE)]));
  fs.writeFileSync(path.join(root, 'user.misc'), Buffer.alloc(m.USERMISC_STRUCT_SIZE * 2));
  return { root, m };
}

test('a save of a User that names neither field leaves the record computer index and connect speed alone', () => {
  const { root, m } = board();
  try {
    const loaded = m.readUserBySlot(1);
    expect(loaded.computerIndex).toBe(5);
    expect(loaded.connectBaud).toBe(9600);
    const before = fs.readFileSync(path.join(root, 'user.data')).subarray(0, 232);
    // What a row-built User looks like: no computerIndex, no connectBaud.
    m.updateUserDataFile({ ...loaded, computerIndex: undefined, connectBaud: undefined }, 1);
    const after = fs.readFileSync(path.join(root, 'user.data')).subarray(0, 232);
    const afterKeys = fs.readFileSync(path.join(root, 'user.keys')).subarray(0, 56);
    expect(m.deserializeUserStruct(after, 0).secBulletin).toBe(5);
    expect(m.deserializeUserKeysStruct(afterKeys, 0).baud).toBe(9600);
    // The protocol byte of a real record ('i' in the fixture) is not overwritten with the new-account 'Z'.
    expect(m.deserializeUserStruct(before, 0).protocol).toBe(0x69);
    expect(m.deserializeUserStruct(after, 0).protocol).toBe(0x69);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a User that names them (the W command) changes exactly those', () => {
  const { root, m } = board();
  try {
    m.updateUserDataFile({ ...m.readUserBySlot(1), computerIndex: 2 }, 1);
    expect(m.readUserBySlot(1).computerIndex).toBe(2);
    expect(m.readUserBySlot(1).connectBaud).toBe(9600);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
