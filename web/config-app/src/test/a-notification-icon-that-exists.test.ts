/**
 * Every notification asked the board for a file it does not serve.
 *
 * Firing a test notification on the live board logged two 404s:
 *
 *     GET https://bbs.uprough.net/vite.svg      404
 *     GET https://bbs.uprough.net/favicon.ico   404
 *
 * The first is the Vite template's icon, which this repo never had; the second
 * is what the service worker, the hook and the board's own push payload all
 * named. The admin is served under `/admin/`, so a root-absolute icon path
 * cannot resolve even once the file exists.
 *
 * This reads the SOURCES rather than a render: the worker is plain JavaScript
 * served as a file, and the payload is built on the backend, so neither is
 * reachable from a component test.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe('the icon a notification shows', () => {
  it('exists in the admin build', () => {
    expect(fs.existsSync(path.join(__dirname, '..', '..', 'public', 'icon.svg'))).toBe(true);
  });

  it('is what the page links, instead of the Vite template icon', () => {
    const html = read('index.html');

    expect(html).not.toContain('vite.svg');
    expect(html).toContain('icon.svg');
  });

  it('is what the service worker draws, by a path that resolves under /admin/', () => {
    const worker = read('public/sw.js');

    expect(worker).not.toContain('/favicon.ico');
    expect(worker).toContain("icon: 'icon.svg'");
    expect(worker).toContain("badge: 'icon.svg'");
  });

  it('is what the board sends with a push', () => {
    const payload = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'backend', 'src', 'utils', 'web-push.util.ts'),
      'utf8',
    );

    expect(payload).not.toContain("'/favicon.ico'");
    expect(payload).toContain("'/admin/icon.svg'");
  });
});
