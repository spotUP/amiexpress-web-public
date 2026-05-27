/**
 * Regression: upload code must update NDIRS after writing to DIR{n}.
 *
 * AquaScan and express.e both read the NDIRS file to know how many DIR
 * files exist in a conference. Before this fix, NDIRS was never updated
 * when new DIR files were created, so doors saw only DIR1 forever even
 * when 21 directories existed on disk.
 *
 * This test verifies that updateNdirsIfNeeded() is exported from
 * dir-file.util and that file-socket-handlers imports and calls it.
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

describe('file-socket-handlers calls updateNdirsIfNeeded', () => {
  test('import of updateNdirsIfNeeded appears in file-socket-handlers.ts', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'server', 'file-socket-handlers.ts'),
      'utf8'
    );
    expect(src).toMatch(/updateNdirsIfNeeded/);
    // Must be imported from dir-file.util
    expect(src).toMatch(/import.*updateNdirsIfNeeded.*from.*dir-file\.util/);
  });

  test('updateNdirsIfNeeded is awaited after writeUploadToDirFile', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'server', 'file-socket-handlers.ts'),
      'utf8'
    );
    // Find the block between writeUploadToDirFile call and FILES.BBS comment
    const m = src.match(/writeUploadToDirFile\([\s\S]*?Write to FILES\.BBS/);
    expect(m).not.toBeNull();
    expect(m && m[0]).toMatch(/await updateNdirsIfNeeded/);
  });
});
