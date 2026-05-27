/**
 * Regression: Conftop-II ctop.data must be updated after each successful upload.
 *
 * Root cause: our upload handler wrote to DIR1 and the SQLite database but never
 * appended a record to ctop.data. The Conftop-II door builds its leaderboard
 * entirely from the 66-byte records in ctop.data, so it always displayed "NONE".
 *
 * Fix: appendCtopRecord() is called from processBatchFile() for every non-duplicate
 * active upload. If ctop.data does not yet exist it is created with the 96-byte
 * header; then the 66-byte record is appended (or written as part of the initial
 * file for atomicity).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  appendCtopRecord,
  buildCtopRecord,
  CTOP_HEADER_SIZE,
  CTOP_RECORD_SIZE,
} from '../src/utils/ctop-updater.util';

// ─── 1. Record format ────────────────────────────────────────────────────────

describe('buildCtopRecord: binary layout', () => {
  test('total size is 66 bytes', () => {
    const rec = buildCtopRecord('SomeUser', 'SomePlace', 12345);
    expect(rec.length).toBe(CTOP_RECORD_SIZE);
    expect(CTOP_RECORD_SIZE).toBe(66);
  });

  test('username occupies bytes 0-31 (null-padded)', () => {
    const rec = buildCtopRecord('SPOT', 'NYC', 0);
    expect(rec.toString('latin1', 0, 4)).toBe('SPOT');
    // Remainder of the 32-byte field is zero-filled
    expect(rec.readUInt8(4)).toBe(0);
    expect(rec.readUInt8(31)).toBe(0);
  });

  test('location occupies bytes 32-61 (null-padded)', () => {
    const rec = buildCtopRecord('X', 'TORONTO', 0);
    expect(rec.toString('latin1', 32, 39)).toBe('TORONTO');
    expect(rec.readUInt8(39)).toBe(0);
    expect(rec.readUInt8(61)).toBe(0);
  });

  test('fsize is Int32BE at byte 62', () => {
    const rec = buildCtopRecord('X', 'Y', 98765);
    expect(rec.readInt32BE(62)).toBe(98765);
  });

  test('username longer than 32 bytes is truncated', () => {
    const long = 'A'.repeat(40);
    const rec = buildCtopRecord(long, '', 0);
    expect(rec.toString('latin1', 0, 32)).toBe('A'.repeat(32));
  });

  test('location longer than 30 bytes is truncated', () => {
    const long = 'B'.repeat(40);
    const rec = buildCtopRecord('X', long, 0);
    expect(rec.toString('latin1', 32, 62)).toBe('B'.repeat(30));
  });
});

// ─── 2. appendCtopRecord: file creation ──────────────────────────────────────

describe('appendCtopRecord: creates file with header', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ctop-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true });
  });

  test('creates ctop.data when it does not exist', async () => {
    await appendCtopRecord(tmpDir, 'SPOT', 'NYC', 10000);
    const stat = await fs.promises.stat(path.join(tmpDir, 'ctop.data'));
    expect(stat.size).toBe(CTOP_HEADER_SIZE + CTOP_RECORD_SIZE); // 162 bytes
  });

  test('header is exactly 96 bytes', () => {
    expect(CTOP_HEADER_SIZE).toBe(96);
  });

  test('header+record total matches 162 bytes', () => {
    expect(CTOP_HEADER_SIZE + CTOP_RECORD_SIZE).toBe(162);
  });

  test('created file has "NONE" at topUpName offset (byte 8)', async () => {
    await appendCtopRecord(tmpDir, 'SPOT', 'NYC', 1000);
    const buf = await fs.promises.readFile(path.join(tmpDir, 'ctop.data'));
    // Header: resetDate(4) + startDate(4) = 8 bytes, then topUpName[32]
    expect(buf.toString('latin1', 8, 12)).toBe('NONE');
  });

  test('created file has "NONE" at periodUpName offset (byte 52)', async () => {
    await appendCtopRecord(tmpDir, 'SPOT', 'NYC', 1000);
    const buf = await fs.promises.readFile(path.join(tmpDir, 'ctop.data'));
    // Header: 8 + 32(topUpName) + 8(topUpBytes) + 4(topUpFiles) = 52
    expect(buf.toString('latin1', 52, 56)).toBe('NONE');
  });

  test('first record username is at byte 96 (after header)', async () => {
    await appendCtopRecord(tmpDir, 'TESTUSER', 'LOCATION', 5000);
    const buf = await fs.promises.readFile(path.join(tmpDir, 'ctop.data'));
    expect(buf.toString('latin1', 96, 104)).toBe('TESTUSER');
  });

  test('first record fsize is at byte 158 (96 + 62)', async () => {
    await appendCtopRecord(tmpDir, 'X', 'Y', 98765);
    const buf = await fs.promises.readFile(path.join(tmpDir, 'ctop.data'));
    expect(buf.readInt32BE(158)).toBe(98765);
  });

  test('resetDate in header is a future date (positive Amiga days)', async () => {
    await appendCtopRecord(tmpDir, 'X', 'Y', 0);
    const buf = await fs.promises.readFile(path.join(tmpDir, 'ctop.data'));
    const resetDate = buf.readInt32BE(0);
    const startDate = buf.readInt32BE(4);
    expect(resetDate).toBeGreaterThan(startDate);
    // resetDate should be in the future (Amiga day 0 = 1978-01-01, today >> 0)
    expect(resetDate).toBeGreaterThan(17000); // 1978 + ~46 years
  });
});

// ─── 3. appendCtopRecord: appending ──────────────────────────────────────────

describe('appendCtopRecord: appends records to existing file', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ctop-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true });
  });

  test('second upload appends a second 66-byte record', async () => {
    await appendCtopRecord(tmpDir, 'USER1', 'LOC1', 1000);
    await appendCtopRecord(tmpDir, 'USER2', 'LOC2', 2000);
    const stat = await fs.promises.stat(path.join(tmpDir, 'ctop.data'));
    expect(stat.size).toBe(CTOP_HEADER_SIZE + 2 * CTOP_RECORD_SIZE);
  });

  test('10 uploads → 10 records after the header', async () => {
    for (let i = 1; i <= 10; i++) {
      await appendCtopRecord(tmpDir, `USER${i}`, `LOC${i}`, i * 1000);
    }
    const stat = await fs.promises.stat(path.join(tmpDir, 'ctop.data'));
    expect(stat.size).toBe(CTOP_HEADER_SIZE + 10 * CTOP_RECORD_SIZE);
  });

  test('second record username is readable at correct offset', async () => {
    await appendCtopRecord(tmpDir, 'FIRST', 'A', 100);
    await appendCtopRecord(tmpDir, 'SECOND', 'B', 200);
    const buf = await fs.promises.readFile(path.join(tmpDir, 'ctop.data'));
    const secondRecOff = CTOP_HEADER_SIZE + CTOP_RECORD_SIZE;
    expect(buf.toString('latin1', secondRecOff, secondRecOff + 6)).toBe('SECOND');
  });

  test('does not recreate header when file already has header', async () => {
    await appendCtopRecord(tmpDir, 'U', 'L', 1);
    const buf1 = await fs.promises.readFile(path.join(tmpDir, 'ctop.data'));
    const resetDate1 = buf1.readInt32BE(0);

    // Small delay so timestamps could differ if header were rewritten
    await new Promise(r => setTimeout(r, 20));
    await appendCtopRecord(tmpDir, 'V', 'M', 2);

    const buf2 = await fs.promises.readFile(path.join(tmpDir, 'ctop.data'));
    const resetDate2 = buf2.readInt32BE(0);
    expect(resetDate2).toBe(resetDate1); // Header unchanged
  });
});

// ─── 4. Static wiring check ───────────────────────────────────────────────────

describe('file-socket-handlers: wired to appendCtopRecord', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'server', 'file-socket-handlers.ts'),
    'utf8'
  );

  test('imports appendCtopRecord from ctop-updater.util', () => {
    expect(src).toMatch(/appendCtopRecord/);
    expect(src).toMatch(/ctop-updater\.util/);
  });

  test('only calls appendCtopRecord for non-duplicate active uploads', () => {
    // The guard must include both conditions
    expect(src).toMatch(/!foundDupe && fileStatus === ['"]active['"]/);
  });
});
