/**
 * The service worker at root scope: `/sw.js`.
 *
 * Callers' push (NOTIFY) needs a worker whose scope covers the web terminal,
 * which is served at `/`. The sysop's admin already ships one - the same
 * `sw.js`, which shows a push and opens `data.url` - but it is served under
 * `/admin/`, where its scope cannot reach `/`. This serves THAT file again at
 * the root instead of keeping a second worker: the admin's built copy
 * (`web/config-app/dist/sw.js`, which vite copies from `public/`), or the source
 * in `public/` on a checkout that has not built the admin.
 *
 * Root path means root scope, so no Service-Worker-Allowed header is needed.
 * `no-cache` because a browser revalidates a worker script anyway and a stale
 * copy would hold back a fix.
 */
import * as fs from 'fs';
import { join } from 'path';
import type { Request, Response } from 'express';

export function rootServiceWorkerPath(projectRoot: string): string | null {
  for (const rel of ['web/config-app/dist/sw.js', 'web/config-app/public/sw.js']) {
    const p = join(projectRoot, rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function serveRootServiceWorker(projectRoot: string) {
  return (_req: Request, res: Response): void => {
    const file = rootServiceWorkerPath(projectRoot);
    if (!file) {
      res.status(404).type('text/plain').send('No service worker is built on this board.\n');
      return;
    }
    res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.sendFile(file);
  };
}
