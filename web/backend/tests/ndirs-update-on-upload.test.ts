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

describe('upload always targets DIR1', () => {
  test('uploadDirNum is hardcoded to 1 in file-socket-handlers.ts', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'server', 'file-socket-handlers.ts'),
      'utf8'
    );
    // Must use the literal constant 1, not a dynamic getDirFiles/getMaxDirs count
    expect(src).toMatch(/const uploadDirNum = 1/);
    expect(src).not.toMatch(/getMaxDirs/);
  });

  test('file-socket-handlers does not import updateNdirsIfNeeded', () => {
    // NDIRS is sysop config; uploads must not auto-increment it
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'server', 'file-socket-handlers.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/updateNdirsIfNeeded/);
  });
});
