/**
 * The worker for callers' push is the admin's own sw.js, served at /sw.js.
 */
import * as fs from 'fs';
import * as os from 'os';
import { join } from 'path';
import express from 'express';
import { rootServiceWorkerPath, serveRootServiceWorker } from '../../src/server/root-service-worker';

const REPO = join(__dirname, '../../../..');

describe('/sw.js', () => {
  it('finds the admin worker in a checkout, preferring the built copy', () => {
    expect(rootServiceWorkerPath(REPO)).toMatch(/web\/config-app\/(dist|public)\/sw\.js$/);
    const root = fs.mkdtempSync(join(os.tmpdir(), 'sw-'));
    fs.mkdirSync(join(root, 'web/config-app/dist'), { recursive: true });
    fs.mkdirSync(join(root, 'web/config-app/public'), { recursive: true });
    fs.writeFileSync(join(root, 'web/config-app/dist/sw.js'), '// built');
    fs.writeFileSync(join(root, 'web/config-app/public/sw.js'), '// source');
    expect(rootServiceWorkerPath(root)).toBe(join(root, 'web/config-app/dist/sw.js'));
    fs.rmSync(root, { recursive: true, force: true });
    expect(rootServiceWorkerPath(root)).toBeNull();
  });

  it('answers 200 JavaScript with no-cache, and a worker that shows a push and opens data.url', async () => {
    const app = express();
    app.get('/sw.js', serveRootServiceWorker(REPO));
    const server = app.listen(0);
    try {
      const port = (server.address() as any).port;
      const res = await fetch(`http://127.0.0.1:${port}/sw.js`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('javascript');
      expect(res.headers.get('cache-control')).toBe('no-cache');
      const body = await res.text();
      expect(body).toContain("addEventListener('push'");
      expect(body).toContain('data.url');
    } finally {
      server.close();
    }
  });

  it('answers 404 rather than the SPA page when no worker is built', async () => {
    const app = express();
    app.get('/sw.js', serveRootServiceWorker(join(os.tmpdir(), 'nowhere-sw')));
    const server = app.listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${(server.address() as any).port}/sw.js`);
      expect(res.status).toBe(404);
    } finally {
      server.close();
    }
  });
});
