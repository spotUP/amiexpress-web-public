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
    // Nine flags and the NUL express.e's AstrCopy(..,10) leaves (848aa4329).
    expect(after.subarray(at, at + 10).toString('latin1')).toBe('XX_X_____\0');
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

describe('writeRejoinAt', () => {
  it('patches exactly the two rejoin bytes of the named slot, big-endian', () => {
    const { mgr, root } = makeManager();
    const before = fs.readFileSync(path.join(root, 'user.data'));
    const at = SIZE + mgr.confRJoinOffset();

    mgr.writeRejoinAt(2, 7);

    const after = fs.readFileSync(path.join(root, 'user.data'));
    // INT16 big-endian, as the Amiga struct reads it.
    expect(after.readInt16BE(at)).toBe(7);
    expect(after.subarray(at, at + 2)).toEqual(Buffer.from([0x00, 0x07]));
    // Everything else - slot 1, slot 3, and the rest of slot 2 - is untouched.
    expect(after.subarray(0, at)).toEqual(before.subarray(0, at));
    expect(after.subarray(at + 2)).toEqual(before.subarray(at + 2));
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('the rejoin bytes sit 14 past the access map, where the struct writes them', () => {
    const { mgr, root } = makeManager();
    expect(mgr.confRJoinOffset()).toBe(mgr.conferenceAccessOffset() + 14);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('refuses slot 0', () => {
    const { mgr, root } = makeManager();
    expect(() => mgr.writeRejoinAt(0, 1)).toThrow(/invalid slot 0/);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
