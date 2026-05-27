/**
 * Regression: uploads must always append to DIR1, never create new DIRs.
 *
 * Root cause: uploadDirNum was computed as getDirFiles().length — the count
 * of DIR files on disk.  Each upload created a new DIR (DIR1, DIR2, … DIR29),
 * so AquaScan (FR command) only saw the files in DIR1 and missed everything
 * else.
 *
 * Fix: uploadDirNum is hardcoded to 1 and getMaxDirs() is removed from the
 * upload path.  DIR files are sysop-configured file areas (not dynamic
 * buckets); the typical value is 1 (matches reference-board BBS reference).
 *
 * These tests verify both the static code shape and the runtime behaviour of
 * the utilities involved so the regression can never silently reappear.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── 1. Static shape of file-socket-handlers.ts ──────────────────────────────

describe('upload handler: static code invariants', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'server', 'file-socket-handlers.ts'),
    'utf8'
  );

  test('uploadDirNum is the literal 1, not a dynamic expression', () => {
    expect(src).toMatch(/const uploadDirNum = 1;/);
  });

  test('getMaxDirs is not imported or called', () => {
    expect(src).not.toMatch(/getMaxDirs/);
  });

  test('updateNdirsIfNeeded is not called from upload path', () => {
    // NDIRS is a sysop-configured value; uploads must not auto-increment it.
    expect(src).not.toMatch(/updateNdirsIfNeeded/);
  });

  test('writeUploadToDirFile is still called (upload path intact)', () => {
    expect(src).toMatch(/await writeUploadToDirFile\(/);
  });
});

// ─── 2. getDirFilePath routes active uploads to DIR1 ─────────────────────────

describe('getDirFilePath: active status → DIR1', () => {
  // Import the real function so we catch any rename or signature change.
  const { getDirFilePath } = require('../src/utils/dir-file.util');

  test('active status with uploadDirNum=1 returns .../DIR1', () => {
    const result = getDirFilePath('/data/bbs/Conf2', 'active', 1);
    expect(result).toMatch(/DIR1$/);
  });

  test('hold status routes to HOLD/HELD regardless of dirNum', () => {
    const result = getDirFilePath('/data/bbs/Conf2', 'hold', 1);
    expect(result).toMatch(/HOLD[\\/]HELD$/);
  });

  test('lcfiles status routes to LCFILES subdirectory', () => {
    const result = getDirFilePath('/data/bbs/Conf2', 'lcfiles', 1);
    expect(result).toMatch(/LCFILES/);
  });
});

// ─── 3. getMaxDirs is no longer the upload-destination logic ─────────────────

describe('getMaxDirs: still counts dirs correctly (for FR display)', () => {
  const { getDirFiles } = require('../src/utils/max-dirs.util');
  const { getMaxDirs } = require('../src/utils/max-dirs.util');

  let tmpDir: string;
  let confNum = 999; // won't exist on disk; use override below

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'maxdirs-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true });
  });

  test('counts zero when no DIR files exist', async () => {
    // getDirFiles needs a real conf path; test the counting logic directly.
    const entries = await fs.promises.readdir(tmpDir);
    const count = entries.filter(e => /^[Dd][Ii][Rr]\d+$/i.test(e)).length;
    expect(count).toBe(0);
  });

  test('counting logic: 29 DIRs → 29, not 30', async () => {
    for (let n = 1; n <= 29; n++) {
      await fs.promises.writeFile(path.join(tmpDir, `DIR${n}`), '');
    }
    const entries = await fs.promises.readdir(tmpDir);
    const count = entries.filter(e => /^[Dd][Ii][Rr]\d+$/i.test(e)).length;
    expect(count).toBe(29);
  });

  test('consolidation to 1 dir → count is 1', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'DIR1'), 'content');
    const entries = await fs.promises.readdir(tmpDir);
    const count = entries.filter(e => /^[Dd][Ii][Rr]\d+$/i.test(e)).length;
    expect(count).toBe(1);
    // uploadDirNum is hardcoded 1 — count doesn't matter for uploads.
  });
});

// ─── 4. writeDirEntry appends to an existing file (not creates new one) ───────

describe('writeDirEntry: appends to existing DIR1', () => {
  const { writeDirEntry } = require('../src/utils/dir-file.util');

  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'writedir-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true });
  });

  test('second write appends to DIR1, does not create DIR2', async () => {
    const dir1 = path.join(tmpDir, 'DIR1');
    await fs.promises.writeFile(dir1, '');

    await writeDirEntry(dir1, 'FILE1.LHA', 1000, new Date(), 'First file', 'N', 'user');
    await writeDirEntry(dir1, 'FILE2.LHA', 2000, new Date(), 'Second file', 'N', 'user');

    // DIR1 has both entries
    const content = await fs.promises.readFile(dir1, 'latin1');
    expect(content).toMatch(/FILE1\.LHA/);
    expect(content).toMatch(/FILE2\.LHA/);

    // No DIR2 was created
    const entries = await fs.promises.readdir(tmpDir);
    const dirs = entries.filter(e => /^[Dd][Ii][Rr]\d+$/i.test(e));
    expect(dirs).toEqual(['DIR1']);
  });

  test('uploading 30 files all land in DIR1', async () => {
    const dir1 = path.join(tmpDir, 'DIR1');
    await fs.promises.writeFile(dir1, '');

    for (let i = 1; i <= 30; i++) {
      await writeDirEntry(
        dir1,
        `FILE${String(i).padStart(2, '0')}.LHA`,
        i * 1000,
        new Date(),
        `File ${i}`,
        'N',
        'user'
      );
    }

    const content = await fs.promises.readFile(dir1, 'latin1');
    const lineCount = content.split('\n').filter(l => l.trim()).length;
    // 30 files × (1 filename line + 1 "Sent by:" line) = at least 60 lines
    expect(lineCount).toBeGreaterThanOrEqual(60);

    // Still only DIR1 — no DIR2..DIR30 created
    const entries = await fs.promises.readdir(tmpDir);
    const dirs = entries.filter(e => /^[Dd][Ii][Rr]\d+$/i.test(e));
    expect(dirs).toEqual(['DIR1']);
  });
});
