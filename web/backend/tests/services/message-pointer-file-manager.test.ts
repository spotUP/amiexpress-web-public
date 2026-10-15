/**
 * Regression tests for MessagePointerFileManager.
 *
 * Each test would have failed before the manager existed because the
 * `<conf>/Conf.DB` file would either not be touched at all or would not
 * preserve unrelated fields across a pointer update.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  MessagePointerFileManager,
  CONFBASE_RECORD_SIZE,
  serializeConfBase,
  deserializeConfBase,
} from '../../src/services/MessagePointerFileManager';

function makeTmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'confdb-test-'));
}

describe('MessagePointerFileManager', () => {
  let tmpRoot: string;
  let mgr: MessagePointerFileManager;

  beforeEach(() => {
    tmpRoot = makeTmpRoot();
    mgr = new MessagePointerFileManager(tmpRoot);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('confBase struct serializes to exactly 74 bytes (axobjects.e:136-155)', () => {
    const rec = deserializeConfBase(Buffer.alloc(CONFBASE_RECORD_SIZE));
    const buf = serializeConfBase(rec);
    expect(buf.length).toBe(74);
  });

  test('round-trip: serialize → deserialize preserves all fields', () => {
    const dl = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const ul = Buffer.from([8, 7, 6, 5, 4, 3, 2, 1]);
    const orig = {
      handle: Buffer.from('spot\0\0\0\0\0\0\0\0\0\0\0\0', 'latin1'),
      downloadBytesBCD: dl,
      uploadBytesBCD: ul,
      newSinceDate: 1764000000,
      confRead: 12345,
      confYM: 67890,
      bytesDownload: 999_999_999,
      bytesUpload: 888_888_888,
      uploadTracking: 7,
      unused: 0,
      unused2: 0,
      upload: 42,
      downloads: 17,
      ratioType: 3,
      ratio: 5,
      messagesPosted: 100,
      access: 255,
      active: 1,
    };
    const buf = serializeConfBase(orig);
    const back = deserializeConfBase(buf);

    expect(back.handle.toString('latin1', 0, 4)).toBe('spot');
    expect(back.confRead).toBe(12345);
    expect(back.confYM).toBe(67890);
    expect(back.bytesDownload).toBe(999_999_999);
    expect(back.bytesUpload).toBe(888_888_888);
    expect(back.messagesPosted).toBe(100);
    expect(back.access).toBe(255);
    expect(back.active).toBe(1);
    expect(Array.from(back.downloadBytesBCD)).toEqual(Array.from(dl));
    expect(Array.from(back.uploadBytesBCD)).toEqual(Array.from(ul));
  });

  test('updateReadPointer writes confYM at (slot-1)*74 in <bbsRoot>/Conf{N}/Conf.DB', () => {
    mgr.updateReadPointer(7, 22, 555);
    const filePath = path.join(tmpRoot, 'Conf7', 'Conf.DB');
    expect(fs.existsSync(filePath)).toBe(true);

    const stat = fs.statSync(filePath);
    expect(stat.size).toBe(CONFBASE_RECORD_SIZE * 22); // slots 1..22 → 22 records

    const buf = fs.readFileSync(filePath);
    const rec = deserializeConfBase(buf.subarray(CONFBASE_RECORD_SIZE * 21));
    expect(rec.confYM).toBe(555);
    expect(rec.confRead).toBe(0); // untouched
  });

  test('updateScanPointer writes confRead at (slot-1)*74', () => {
    mgr.updateScanPointer(3, 5, 9999);
    const buf = fs.readFileSync(path.join(tmpRoot, 'Conf3', 'Conf.DB'));
    const rec = deserializeConfBase(buf.subarray(CONFBASE_RECORD_SIZE * 4));
    expect(rec.confRead).toBe(9999);
    expect(rec.confYM).toBe(0);
  });

  test('read-modify-write preserves other fields when patching just one pointer', () => {
    // Seed slot 5 with a fully-populated record so we can verify nothing else changes.
    const confDir = path.join(tmpRoot, 'Conf2');
    fs.mkdirSync(confDir, { recursive: true });
    const filePath = path.join(confDir, 'Conf.DB');

    const seed = serializeConfBase({
      handle: Buffer.from('preserved\0\0\0\0\0\0\0', 'latin1'),
      downloadBytesBCD: Buffer.from([9, 9, 9, 9, 9, 9, 9, 9]),
      uploadBytesBCD: Buffer.from([8, 8, 8, 8, 8, 8, 8, 8]),
      newSinceDate: 1700000000,
      confRead: 111,
      confYM: 222,
      bytesDownload: 1024,
      bytesUpload: 2048,
      uploadTracking: 0,
      unused: 0,
      unused2: 0,
      upload: 11,
      downloads: 22,
      ratioType: 1,
      ratio: 3,
      messagesPosted: 50,
      access: 200,
      active: 1,
    });
    // Pad: slots 1..4 zero, slot 5 = seed
    const file = Buffer.alloc(CONFBASE_RECORD_SIZE * 5);
    seed.copy(file, CONFBASE_RECORD_SIZE * 4);
    fs.writeFileSync(filePath, file);

    // Update just confYM
    mgr.updateReadPointer(2, 5, 333);

    const back = deserializeConfBase(
      fs.readFileSync(filePath).subarray(CONFBASE_RECORD_SIZE * 4),
    );
    expect(back.confYM).toBe(333);          // changed
    expect(back.confRead).toBe(111);        // preserved
    expect(back.handle.toString('latin1', 0, 9)).toBe('preserved');  // preserved
    expect(back.bytesDownload).toBe(1024);  // preserved
    expect(back.bytesUpload).toBe(2048);    // preserved
    expect(back.messagesPosted).toBe(50);   // preserved
    expect(back.access).toBe(200);          // preserved
    expect(back.active).toBe(1);            // preserved
    expect(Array.from(back.downloadBytesBCD)).toEqual([9, 9, 9, 9, 9, 9, 9, 9]);
  });

  test('rejects slot < 1 (Amiga slot numbers are 1-indexed)', () => {
    expect(() => mgr.updateReadPointer(1, 0, 1)).toThrow(/slotNumber/);
  });

  test('readRecord returns null when file does not exist', () => {
    expect(mgr.readRecord(99, 1)).toBeNull();
  });

  test('readRecord returns null for slot beyond file end', () => {
    mgr.updateReadPointer(1, 1, 1);
    expect(mgr.readRecord(1, 9999)).toBeNull();
  });
});

// axobjects.e:145-154: the confBase INTs are E's 16-bit INT. E stores the low
// 16 bits and reads them back signed. The writer threw ERR_OUT_OF_RANGE for
// 40000 or -1, so the record was not saved at all.
describe('a Conf.DB INT outside 0..32767', () => {
  it('writes 40000 and -1 as E stores them, and reads them back signed', () => {
    const rec = deserializeConfBase(Buffer.alloc(CONFBASE_RECORD_SIZE));
    rec.upload = 40000;
    rec.downloads = -1;
    rec.messagesPosted = 40000;
    rec.ratio = -1;
    const buf = serializeConfBase(rec);
    expect(buf.readUInt16BE(60)).toBe(0x9c40); // upload
    expect(buf.readUInt16BE(62)).toBe(0xffff); // downloads
    const back = deserializeConfBase(buf);
    expect(back.upload).toBe(40000 - 65536);
    expect(back.downloads).toBe(-1);
    expect(back.messagesPosted).toBe(40000 - 65536);
    expect(back.ratio).toBe(-1);
  });
});
