// @ts-nocheck
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { QWKManager } from '../../src/services/qwk.service';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qwk-test-'));
}

describe('QWKManager — constructor', () => {
  test('creates packet directory when it does not exist', () => {
    const tmpDir = makeTempDir();
    const packetDir = path.join(tmpDir, 'packets');
    expect(fs.existsSync(packetDir)).toBe(false);
    new QWKManager(packetDir, 'TESTBBS');
    expect(fs.existsSync(packetDir)).toBe(true);
    fs.rmdirSync(packetDir);
    fs.rmdirSync(tmpDir);
  });

  test('does not throw when directory already exists', () => {
    const tmpDir = makeTempDir();
    expect(() => new QWKManager(tmpDir, 'AMIWEB')).not.toThrow();
    fs.rmdirSync(tmpDir);
  });

  test('uses provided bbsId', () => {
    const tmpDir = makeTempDir();
    const mgr = new QWKManager(tmpDir, 'MYHUB');
    // bbsId is used in filename generation — verify it's stored
    expect((mgr as any).bbsId).toBe('MYHUB');
    fs.rmdirSync(tmpDir);
  });

  test('defaults bbsId to AMIWEB when not specified', () => {
    const tmpDir = makeTempDir();
    const mgr = new QWKManager(tmpDir);
    expect((mgr as any).bbsId).toBe('AMIWEB');
    fs.rmdirSync(tmpDir);
  });
});

describe('QWKManager — parseQWKHeader', () => {
  let mgr: any;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    mgr = new QWKManager(tmpDir, 'TESTBBS');
  });

  afterEach(() => {
    fs.rmdirSync(tmpDir);
  });

  function makeValidHeader(): Buffer {
    const buf = Buffer.alloc(128, 0x20); // space-fill
    buf.write('QWK   ', 0, 'ascii');          // bytes 0-5: signature
    buf.write('AMIBBS  ', 8, 'ascii');         // bytes 8-11: BBS name (4 chars)
    buf.write('AMIWEB  ', 20, 'ascii');        // bytes 20-27: BBS ID
    return buf;
  }

  test('returns signature from valid header', () => {
    const buf = makeValidHeader();
    const result = mgr.parseQWKHeader(buf);
    expect(result.signature).toBe('QWK');
  });

  test('returns bbsId from valid header', () => {
    const buf = makeValidHeader();
    const result = mgr.parseQWKHeader(buf);
    expect(result.bbsId).toBeTruthy();
  });

  test('throws on invalid QWK signature', () => {
    const buf = Buffer.alloc(128, 0x20);
    buf.write('BADHDR', 0, 'ascii'); // Not 'QWK'
    expect(() => mgr.parseQWKHeader(buf)).toThrow('Invalid QWK packet signature');
  });

  test('throws on empty buffer', () => {
    expect(() => mgr.parseQWKHeader(Buffer.alloc(0))).toThrow();
  });
});

describe('QWKManager — parseQWKMessage', () => {
  let mgr: any;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    mgr = new QWKManager(tmpDir, 'TESTBBS');
  });

  afterEach(() => {
    fs.rmdirSync(tmpDir);
  });

  function makeQWKMessage(): Buffer {
    // QWK message block is 128 bytes per block
    const buf = Buffer.alloc(256, 0x20); // 2 blocks, space-filled

    // Status byte
    buf[0] = 0x20; // space = public message

    // Message number (LE u32) at offset 1
    buf.writeUInt32LE(42, 1);

    // Date at offset 8: "MM-DD-YY" (8 chars)
    buf.write('01-15-26', 8, 'ascii');

    // Time at offset 16: "HH:MM" (5 chars)
    buf.write('14:30', 16, 'ascii');

    // To at offset 21: 25 chars, null-padded
    const to = 'TestUser';
    buf.write(to, 21, 'ascii');

    // From at offset 46: 25 chars, null-padded
    const from = 'Sysop';
    buf.write(from, 46, 'ascii');

    // Subject at offset 71: 25 chars, null-padded
    buf.write('Test Subject', 71, 'ascii');

    // Number of blocks at offset 116 — qwk.e stores this as a 6-char ASCII
    // decimal, NOT a binary LE u16 (the prior test wrote it incorrectly).
    buf.write('     2', 116, 'ascii'); // right-justified in 6-char field

    return buf;
  }

  test('returns null for buffer too small to parse', () => {
    const tiny = Buffer.alloc(10);
    const result = mgr.parseQWKMessage(tiny, 0, {});
    expect(result).toBeNull();
  });

  test('parses subject from valid message buffer', () => {
    const buf = makeQWKMessage();
    const header = { signature: 'QWK', bbsId: 'TESTBBS', bbsName: 'Test' };
    const result = mgr.parseQWKMessage(buf, 0, header);
    expect(result).not.toBeNull();
    expect(result.subject).toContain('Test Subject');
  });

  test('parses from field from valid message buffer', () => {
    const buf = makeQWKMessage();
    const header = { signature: 'QWK', bbsId: 'TESTBBS', bbsName: 'Test' };
    const result = mgr.parseQWKMessage(buf, 0, header);
    expect(result?.from).toContain('Sysop');
  });

  test('isPrivate is false when status byte is space', () => {
    const buf = makeQWKMessage();
    buf[0] = 0x20; // space = not private
    const result = mgr.parseQWKMessage(buf, 0, {});
    expect(result?.isPrivate).toBe(false);
  });

  test('isPrivate is true when private bit set', () => {
    const buf = makeQWKMessage();
    buf[0] = 0x01; // bit 0 = private
    const result = mgr.parseQWKMessage(buf, 0, {});
    expect(result?.isPrivate).toBe(true);
  });

  test('totalLength equals numBlocks * 128', () => {
    const buf = Buffer.alloc(384, 0x20);
    buf[0] = 0x20;
    buf.write('01-15-26', 8, 'ascii');
    buf.write('14:30', 16, 'ascii');
    // qwk.e numBlocks is a 6-char ASCII decimal at offset 116
    buf.write('     3', 116, 'ascii');
    const result = mgr.parseQWKMessage(buf, 0, {});
    expect(result?.totalLength).toBe(3 * 128);
  });
});
