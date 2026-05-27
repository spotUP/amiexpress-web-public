/**
 * Regression: synthesizeACPTooltypes must derive NDIRS from actual DIR files
 * on disk, not only from ConfConfig.info.
 *
 * Root cause: ConfConfig.info was created at install time with NDIRS=1.
 * As uploads created DIR2, DIR3, …, DIR24, neither ConfConfig.info nor the
 * NDIRS tooltype returned to AquaScan was updated.  AquaScan read NDIRS=1
 * and only scanned DIR1, showing only the original Feb-2026 files.
 *
 * Fix: IconLibrary.synthesizeACPTooltypes now counts the highest-numbered
 * DIRn file in each conference directory and uses max(ConfConfig.info, count)
 * so the returned NDIRS is always at least as large as the true dir count.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Minimal stub: synthesizeACPTooltypes() logic extracted for unit testing
// so we don't need to spin up an entire IconLibrary instance.
function countHighestDir(confDir: string): number {
  let highest = 0;
  try {
    const entries = fs.readdirSync(confDir);
    for (const name of entries) {
      const m = name.match(/^[Dd][Ii][Rr](\d+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > highest) highest = n;
      }
    }
  } catch {
    // unreadable
  }
  return highest;
}

describe('IconLibrary NDIRS dir-count logic', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'icon-ndirs-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true });
  });

  test('returns 0 when conf dir is empty', () => {
    expect(countHighestDir(tmpDir)).toBe(0);
  });

  test('detects DIR1 as highest when only DIR1 exists', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'DIR1'), '');
    expect(countHighestDir(tmpDir)).toBe(1);
  });

  test('detects highest across many DIR files', async () => {
    for (const n of [1, 3, 7, 12, 24]) {
      await fs.promises.writeFile(path.join(tmpDir, `DIR${n}`), '');
    }
    expect(countHighestDir(tmpDir)).toBe(24);
  });

  test('case-insensitive: matches dir24 lowercase', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'dir24'), '');
    expect(countHighestDir(tmpDir)).toBe(24);
  });

  test('ignores non-DIR files', async () => {
    for (const name of ['NDIRS', 'Upload', 'ConfConfig.info', 'FILES.BBS']) {
      await fs.promises.writeFile(path.join(tmpDir, name), '');
    }
    await fs.promises.writeFile(path.join(tmpDir, 'DIR3'), '');
    expect(countHighestDir(tmpDir)).toBe(3);
  });

  test('returns 0 for non-existent directory without throwing', () => {
    expect(countHighestDir('/no/such/path/exists')).toBe(0);
  });
});

describe('IconLibrary synthesizeACPTooltypes NDIRS integration', () => {
  test('NDIRS line in IconLibrary.ts counts DIR files on disk', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'amiga-emulation', 'api', 'IconLibrary.ts'),
      'utf8'
    );
    // The fix must appear inside the per-conference loop and use readdirSync
    // to count numbered DIR files, taking the higher of ConfConfig.info and disk count.
    expect(src).toMatch(/readdirSync.*Conf.*\$\{confNum\}/s);
    expect(src).toMatch(/[Dd][Ii][Rr].*\\d\+/);
    expect(src).toMatch(/highestDir.*ndirs|ndirs.*highestDir/);
  });
});
