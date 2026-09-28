/**
 * Regression: upload code must always write to DIR1 (the sysop-configured upload area).
 *
 * Root cause: uploadDirNum was computed as getDirFiles().length — the count of
 * existing DIR files on disk. Each upload that landed in a new DIR incremented
 * the count, so the next upload targeted yet another new DIR. This created 29
 * separate file areas instead of appending to DIR1.
 *
 * Fix: uploadDirNum is hardcoded to 1.  express.e reads NDIRS from ConfConfig.info
 * (set at install time, typically 1); it is NOT derived from how many DIR files
 * currently exist on disk.
 *
 * The updateNdirsIfNeeded helper is retained for other callers but is no longer
 * invoked from the upload path — NDIRS is sysop config, not a dynamic counter.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('updateNdirsIfNeeded', () => {
  const util = require('../src/utils/dir-file.util');

  test('is exported from dir-file.util', () => {
    expect(typeof util.updateNdirsIfNeeded).toBe('function');
  });

  test('creates NDIRS when it does not exist', async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ndirs-'));
    try {
      await util.updateNdirsIfNeeded(tmpDir, 5);
      const content = await fs.promises.readFile(path.join(tmpDir, 'NDIRS'), 'utf8');
      expect(content).toBe('5');
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true });
    }
  });

  test('updates NDIRS when new value is higher', async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ndirs-'));
    try {
      await fs.promises.writeFile(path.join(tmpDir, 'NDIRS'), '3', 'utf8');
      await util.updateNdirsIfNeeded(tmpDir, 7);
      const content = await fs.promises.readFile(path.join(tmpDir, 'NDIRS'), 'utf8');
      expect(content).toBe('7');
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true });
    }
  });

  test('does not decrease NDIRS when new value is lower', async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ndirs-'));
    try {
      await fs.promises.writeFile(path.join(tmpDir, 'NDIRS'), '10', 'utf8');
      await util.updateNdirsIfNeeded(tmpDir, 3);
      const content = await fs.promises.readFile(path.join(tmpDir, 'NDIRS'), 'utf8');
      expect(content).toBe('10');
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true });
    }
  });

  test('does not update NDIRS when value is equal', async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ndirs-'));
    try {
      await fs.promises.writeFile(path.join(tmpDir, 'NDIRS'), '5', 'utf8');
      const mtime1 = (await fs.promises.stat(path.join(tmpDir, 'NDIRS'))).mtimeMs;
      // small delay so mtime would differ if the file were rewritten
      await new Promise(r => setTimeout(r, 10));
      await util.updateNdirsIfNeeded(tmpDir, 5);
      const mtime2 = (await fs.promises.stat(path.join(tmpDir, 'NDIRS'))).mtimeMs;
      expect(mtime2).toBe(mtime1);
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true });
    }
  });
});

// The upload-path half of this regression - an upload files into DIR1 and
// never touches NDIRS - is driven at runtime through `processBatchFile` in
// tests/upload-to-dir1-regression.test.ts (a conference with DIR1..DIR3 and
// NDIRS=3; the entry lands in DIR1, DIR2/DIR3/NDIRS are unchanged). The
// source-text pins that stood here checked a variable's spelling and an
// import's absence in two named files; that runtime test covers both.
