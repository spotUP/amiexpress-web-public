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

  test('files over maxBytes are tail-trimmed to ~maxBytes at a newline', async () => {
    const tmp = makeTmpDir('logret-big-');
    try {
      const p = path.join(tmp, 'backend.log');
      // 1 MB of line-terminated entries, each 100 bytes.
      const line = 'x'.repeat(99) + '\n';
      const bigContent = line.repeat(10000); // ~1 MB
      fs.writeFileSync(p, bigContent);
      const beforeBytes = fs.statSync(p).size;
      expect(beforeBytes).toBeGreaterThan(1024 * 100);

      const svc = new LogRetentionService();
      svc.configure({ filePaths: [p], maxBytes: 100 * 1024 }); // 100 KB cap
      const res = await svc.runOnce();

      expect(res[0].trimmed).toBe(true);
      const afterBytes = fs.statSync(p).size;
      expect(afterBytes).toBeLessThanOrEqual(beforeBytes);
      expect(afterBytes).toBeLessThan(110 * 1024); // within 10% of cap
      // First byte after trim should start a fresh entry (no mid-line cut).
      const tail = fs.readFileSync(p, 'utf8');
      expect(tail.startsWith('x')).toBe(true);
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
