/**
 * Ten bytes change; ten bytes are written - at the right slot.
 *
 * The conference removal used to rewrite whole accounts through
 * updateUserDataFile, with a slot of 0: offset -232, which fs.writeSync
 * turns into "write at the current position" - byte 0 - so thirty-plus
 * users were serialized over slot 1 in turn and the -TCB!- account was
 * destroyed on the live board. The targeted writer patches exactly the
 * conferenceAccess field, nothing else, and refuses a slot below 1.
 */

process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { UserFileManager } from '../../src/services/UserFileManager';

const SIZE = 232;

function makeManager(): { mgr: UserFileManager; root: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'user-data-'));
  process.env.BBS_DATA_DIR = root;
  const mgr = new UserFileManager();
  delete process.env.BBS_DATA_DIR;
  // Three slots of distinct filler so any stray write is visible.
  fs.writeFileSync(path.join(root, 'user.data'), Buffer.alloc(SIZE * 3, 0xaa));
  fs.writeFileSync(path.join(root, 'user.keys'), Buffer.alloc(56 * 3, 0xbb));
  fs.writeFileSync(path.join(root, 'user.misc'), Buffer.alloc(248 * 3, 0xcc));
  return { mgr, root };
}

describe('writeConferenceAccessAt', () => {
  it('patches exactly the access bytes of the named slot', () => {
    const { mgr, root } = makeManager();
    const before = fs.readFileSync(path.join(root, 'user.data'));
    const offset = mgr.conferenceAccessOffset();

    mgr.writeConferenceAccessAt(2, 'XX_X______');

    const after = fs.readFileSync(path.join(root, 'user.data'));
    const at = SIZE + offset;
    expect(after.subarray(at, at + 10).toString('latin1')).toBe('XX_X______');
    // Everything else - including slot 1 and slot 3 - is untouched.
    expect(after.subarray(0, at)).toEqual(before.subarray(0, at));
    expect(after.subarray(at + 10)).toEqual(before.subarray(at + 10));
    // And the files the old path rewrote as a side effect are untouched.
    expect(fs.readFileSync(path.join(root, 'user.keys')).every((b) => b === 0xbb)).toBe(true);
    expect(fs.readFileSync(path.join(root, 'user.misc')).every((b) => b === 0xcc)).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('refuses slot 0 - the write that destroyed slot 1', () => {
    const { mgr, root } = makeManager();
    expect(() => mgr.writeConferenceAccessAt(0, 'XXXXXXXXXX')).toThrow(/invalid slot 0/);
    expect(() => mgr.updateUserDataFile({ username: 'x' } as never, 0)).toThrow(/invalid slot 0/);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
