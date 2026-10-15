/**
 * CallersLog lands on the persistent data tree, not the image.
 *
 * The manager rooted at the repo tree while node files live under the
 * data dir - every deploy wiped the audit trail while the console still
 * showed its lines ("emitted but never reach the file", 2026-09-10).
 * Root precedence: explicit arg, then boardRoot() (config.dataDir, which is
 * BBS_DATA_DIR, BBS_ROOT, the repo tree - utils/board-root.util).
 */
process.env.SKIP_SERVER_START = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CallersLogManager } from '../../src/services/CallersLogManager';
import { setBoardRoot } from '../helpers/board-root';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'callerslog-'));
}

afterEach(() => { jest.restoreAllMocks(); });

describe('CallersLogManager root', () => {
  test('the board root is where the log lands', () => {
    const dir = tempDir();
    try {
      setBoardRoot(dir);
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

  test('an explicit root wins over everything', () => {
    const dir = tempDir();
    try {
      setBoardRoot('/nonexistent-data');
      const mgr = new CallersLogManager(dir);
      mgr.logActivity(3, 'hello');
      expect(fs.existsSync(path.join(dir, 'Node3', 'CallersLog'))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
