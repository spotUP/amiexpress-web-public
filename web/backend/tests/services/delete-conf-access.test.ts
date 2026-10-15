/**
 * deleteConfAccess (express.e:22335-22377): the deleted account's record in
 * every conference's Conf.DB is cleared after `handle[16]`, at the account's
 * slot - and no other record is touched.
 *
 * (express.e passes saveAccount's result, 0, instead of the slot - 21368-21370
 * - which lands the cleared record on someone else. The port clears the
 * account being deleted.)
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { deleteConfAccess } from '../../src/services/delete-conf-access';

const REC = 74;

function confDb(records: number): Buffer {
  const bytes = Buffer.alloc(REC * records);
  for (let r = 0; r < records; r++) {
    for (let i = 0; i < REC; i++) bytes[r * REC + i] = (r * 31 + i) % 251 || 1;
    // A handle with a zero in it and a high-bit byte after: a bit array, not text.
    bytes[r * REC + 2] = 0;
    bytes[r * REC + 5] = 0xc8;
  }
  return bytes;
}

describe('deleteConfAccess', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'delconf-'));
    for (const conf of ['Conf1', 'Conf2']) {
      fs.mkdirSync(path.join(root, conf));
      fs.writeFileSync(path.join(root, conf, 'Conf.DB'), confDb(3));
    }
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('clears the slot\'s record after its handle in every conference, and nothing else', () => {
    const before = fs.readFileSync(path.join(root, 'Conf1', 'Conf.DB'));

    const touched = deleteConfAccess(root, 2);

    expect(touched).toHaveLength(2);
    for (const conf of ['Conf1', 'Conf2']) {
      const after = fs.readFileSync(path.join(root, conf, 'Conf.DB'));
      // Slots 1 and 3 untouched.
      expect(after.subarray(0, REC)).toEqual(before.subarray(0, REC));
      expect(after.subarray(2 * REC)).toEqual(before.subarray(2 * REC));
      // Slot 2: handle kept byte for byte, the rest zero.
      expect(after.subarray(REC, REC + 16)).toEqual(before.subarray(REC, REC + 16));
      expect(after.subarray(REC + 16, 2 * REC).every(b => b === 0)).toBe(true);
    }
  });

  it('leaves a file alone whose slot was never written', () => {
    expect(deleteConfAccess(root, 50)).toEqual([]);
  });
});
