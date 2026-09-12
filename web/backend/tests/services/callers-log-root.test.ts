/**
 * CallersLog lands on the persistent data tree, not the image.
 *
 * The manager rooted at the repo tree while node files live under the
 * data dir - every deploy wiped the audit trail while the console still
 * showed its lines ("emitted but never reach the file", 2026-09-10).
 * Root precedence: explicit arg, BBS_ROOT, BBS_DATA_DIR, repo root.
 */
process.env.SKIP_SERVER_START = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CallersLogManager } from '../../src/services/CallersLogManager';

const OLD_ROOT = process.env.BBS_ROOT;
const OLD_DATA = process.env.BBS_DATA_DIR;

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'callerslog-'));
}

afterEach(() => {
  if (OLD_ROOT === undefined) delete process.env.BBS_ROOT;
  else process.env.BBS_ROOT = OLD_ROOT;
  if (OLD_DATA === undefined) delete process.env.BBS_DATA_DIR;
  else process.env.BBS_DATA_DIR = OLD_DATA;
});

describe('CallersLogManager root', () => {
  test('BBS_DATA_DIR wins over the repo tree', () => {
    const dir = tempDir();
    try {
      delete process.env.BBS_ROOT;
      process.env.BBS_DATA_DIR = dir;
      const mgr = new CallersLogManager();
      mgr.logActivity(1, 'Login infant');
      const logPath = path.join(dir, 'Node1', 'CallersLog');
      expect(fs.existsSync(logPath)).toBe(true);
      expect(fs.readFileSync(logPath, 'utf8')).toContain('Login infant');
      expect(mgr.logPathFor(1)).toBe(logPath);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('BBS_ROOT wins over BBS_DATA_DIR', () => {
    const root = tempDir();
    const data = tempDir();
    try {
      process.env.BBS_ROOT = root;
      process.env.BBS_DATA_DIR = data;
      const mgr = new CallersLogManager();
      mgr.logActivity(2, 'hello');
      expect(fs.existsSync(path.join(root, 'Node2', 'CallersLog'))).toBe(true);
      expect(fs.existsSync(path.join(data, 'Node2', 'CallersLog'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(data, { recursive: true, force: true });
    }
  });

  test('an explicit root wins over everything', () => {
    const dir = tempDir();
    try {
      process.env.BBS_ROOT = '/nonexistent-root';
      process.env.BBS_DATA_DIR = '/nonexistent-data';
      const mgr = new CallersLogManager(dir);
      mgr.logActivity(3, 'hello');
      expect(fs.existsSync(path.join(dir, 'Node3', 'CallersLog'))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
