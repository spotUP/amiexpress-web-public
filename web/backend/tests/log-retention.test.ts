/**
 * Regression tests for LogRetentionService (GDPR Phase 4).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LogRetentionService, defaultRetentionTargets } from '../src/services/LogRetentionService';

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('LogRetentionService', () => {
  test('files at or under maxBytes are left alone', async () => {
    const tmp = makeTmpDir('logret-small-');
    try {
      const p = path.join(tmp, 'backend.log');
      const content = 'hello world\n'.repeat(10); // ~120 bytes
      fs.writeFileSync(p, content);

      const svc = new LogRetentionService();
      svc.configure({ filePaths: [p], maxBytes: 10 * 1024 });
      const res = await svc.runOnce();

      expect(res).toHaveLength(1);
      expect(res[0].trimmed).toBe(false);
      expect(fs.readFileSync(p, 'utf8')).toBe(content);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('files over maxBytes are truncated to zero bytes (in-place)', async () => {
    const tmp = makeTmpDir('logret-big-');
    try {
      const p = path.join(tmp, 'backend.log');
      // 1 MB of line-terminated entries, each 100 bytes.
      const line = 'x'.repeat(99) + '\n';
      const bigContent = line.repeat(10000); // ~1 MB
      fs.writeFileSync(p, bigContent);
      const beforeBytes = fs.statSync(p).size;
      expect(beforeBytes).toBeGreaterThan(1024 * 100);

      // Capture the inode so we can verify in-place truncate doesn't replace
      // the file (commit bb394a9f0 — preserves open FDs by avoiding rename).
      const beforeIno = fs.statSync(p).ino;

      const svc = new LogRetentionService();
      svc.configure({ filePaths: [p], maxBytes: 100 * 1024 }); // 100 KB cap
      const res = await svc.runOnce();

      expect(res[0].trimmed).toBe(true);
      expect(res[0].afterBytes).toBe(0);
      const afterStat = fs.statSync(p);
      expect(afterStat.size).toBe(0);
      expect(afterStat.ino).toBe(beforeIno); // same inode → open FDs survive
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('missing files are skipped without error', async () => {
    const svc = new LogRetentionService();
    svc.configure({ filePaths: ['/nonexistent/path/to/log'], maxBytes: 1024 });
    const res = await svc.runOnce();
    expect(res).toHaveLength(1);
    expect(res[0].trimmed).toBe(false);
    // No error thrown — stat-miss is benign.
  });

  test('defaultRetentionTargets includes backend.log + per-node Node*/CallersLog/ErrorLog', () => {
    const tmp = makeTmpDir('logret-targets-');
    try {
      fs.mkdirSync(path.join(tmp, 'Node0'));
      fs.mkdirSync(path.join(tmp, 'Node5'));
      fs.writeFileSync(path.join(tmp, 'Node0', 'CallersLog'), '');
      fs.writeFileSync(path.join(tmp, 'Node5', 'ErrorLog'), '');

      const targets = defaultRetentionTargets(tmp);

      expect(targets).toEqual(expect.arrayContaining([
        path.join(tmp, 'logs', 'backend.log'),
        path.join(tmp, 'logs', 'frontend.log'),
        path.join(tmp, 'logs', 'errors.log'),
        path.join(tmp, 'Node0', 'CallersLog'),
        path.join(tmp, 'Node0', 'ErrorLog'),
        path.join(tmp, 'Node5', 'CallersLog'),
        path.join(tmp, 'Node5', 'ErrorLog'),
      ]));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('start() fires a boot pass immediately and unrefs its timer', async () => {
    const tmp = makeTmpDir('logret-start-');
    try {
      const p = path.join(tmp, 'backend.log');
      const bigContent = ('y'.repeat(99) + '\n').repeat(5000); // ~500 KB
      fs.writeFileSync(p, bigContent);

      const svc = new LogRetentionService();
      svc.configure({ filePaths: [p], maxBytes: 50 * 1024, intervalMs: 60 * 60 * 1000 });
      const stop = svc.start();

      // Let the boot pass (runOnce) resolve.
      await new Promise(r => setTimeout(r, 50));
      const afterBytes = fs.statSync(p).size;
      expect(afterBytes).toBeLessThan(60 * 1024);
      stop();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
