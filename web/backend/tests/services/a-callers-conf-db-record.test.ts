/**
 * The caller's per-conference record in Conf.DB, written the way express.e
 * reads it back.
 *
 *  - handle[0] is a byte of flags, not text (axconsts.e:45-48). Bit 7 is
 *    MAILSCAN_ALL; an ascii decode drops it, so every pointer save turned a
 *    caller's "scan all mail" off.
 *  - The file is where LOCATION.n says (getConfDbFileName, express.e:2102-2111),
 *    not `Conf<n>`: on a renumbered board that is the deleted conference's.
 *  - A download / upload is booked into the record's BCD and LONG and its
 *    count (express.e:15439-15452, 19444-19446 with 4929-4939).
 *  - CM's updateAllUsers changes one field in every record (22459-22519).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyTooltypes } from '../../src/utils/info-file.util';
import {
  MessagePointerFileManager,
  CONFBASE_RECORD_SIZE,
  deserializeConfBase,
} from '../../src/services/MessagePointerFileManager';
import { readPackedBCD } from '../../src/utils/bcd-math.util';

describe("a caller's Conf.DB record", () => {
  let root: string;
  let mgr: MessagePointerFileManager;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'confdb-record-'));
    mgr = new MessagePointerFileManager(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function recordOnDisk(dir: string, slot: number) {
    const buf = fs.readFileSync(path.join(root, dir, 'Conf.DB'));
    return deserializeConfBase(buf, (slot - 1) * CONFBASE_RECORD_SIZE);
  }

  test('a pointer save keeps MAILSCAN_ALL (bit 7) and the vote bits of handle', () => {
    fs.mkdirSync(path.join(root, 'Conf1'));
    const file = Buffer.alloc(CONFBASE_RECORD_SIZE * 3);
    file[CONFBASE_RECORD_SIZE * 2 + 0] = 128 | 4; // MAILSCAN_ALL | MAIL_SCAN_MASK
    file[CONFBASE_RECORD_SIZE * 2 + 1] = 0x81;    // voted topics
    fs.writeFileSync(path.join(root, 'Conf1', 'Conf.DB'), file);

    mgr.updateReadPointer(1, 3, 42);

    const raw = fs.readFileSync(path.join(root, 'Conf1', 'Conf.DB'));
    expect(raw[CONFBASE_RECORD_SIZE * 2 + 0]).toBe(132);
    expect(raw[CONFBASE_RECORD_SIZE * 2 + 1]).toBe(0x81);
    expect(recordOnDisk('Conf1', 3).confYM).toBe(42);
  });

  test("on a renumbered board the record is in LOCATION.n's directory, not Conf<n>", () => {
    applyTooltypes(path.join(root, 'ConfConfig.info'), [
      ['NCONFS', '1'], ['NAME.1', 'Moved'], ['LOCATION.1', 'BBS:Conf2/'],
    ]);
    fs.mkdirSync(path.join(root, 'Conf1'));
    fs.mkdirSync(path.join(root, 'Conf2'));

    mgr.updateReadPointer(1, 1, 77);

    expect(fs.existsSync(path.join(root, 'Conf2', 'Conf.DB'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'Conf1', 'Conf.DB'))).toBe(false);
    expect(recordOnDisk('Conf2', 1).confYM).toBe(77);
  });

  test('a download is booked in BCD, LONG and count; the swapped-out account likewise', () => {
    mgr.addDownload(1, 2, 1000);
    mgr.addDownload(1, 2, 24);
    // saveMsgPointers' account half (express.e:4929-4939) after one upload.
    mgr.putAccount(1, 2, { bytesDownload: 1024, bytesUpload: 500, uploads: 1, downloads: 2, ratioType: 0, ratio: 0 });

    const rec = recordOnDisk('Conf1', 2);
    expect(rec.downloads).toBe(2);
    expect(rec.bytesDownload).toBe(1024);
    expect(readPackedBCD(rec.downloadBytesBCD, 0)).toBe(1024n);
    expect(rec.upload).toBe(1);
    expect(rec.bytesUpload).toBe(500);
    expect(readPackedBCD(rec.uploadBytesBCD, 0)).toBe(500n);
    // Slot 1 is somebody else and untouched.
    expect(recordOnDisk('Conf1', 1).downloads).toBe(0);
  });

  test("CM's updateAllUsers changes the field in every record and nothing else", () => {
    mgr.updateReadPointer(1, 1, 5);
    mgr.updateReadPointer(1, 3, 9);

    const written = mgr.updateAllUsers(1, rec => { rec.ratio = 3; });

    expect(written).toBe(3);
    for (const slot of [1, 2, 3]) expect(recordOnDisk('Conf1', slot).ratio).toBe(3);
    expect(recordOnDisk('Conf1', 3).confYM).toBe(9);
  });

  test('a slot past the end of the file reads as a zeroed record (express.e:4843-4847)', () => {
    expect(mgr.readRaw(1, 50)).toEqual(Buffer.alloc(CONFBASE_RECORD_SIZE));
  });
});
