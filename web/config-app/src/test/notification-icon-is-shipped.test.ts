/**
 * THE NOTIFICATION ICON MUST EXIST, AND BE COMMITTED.
 *
 * A push notification names an icon and a badge. The backend sends
 * `/admin/icon.svg` (web-push.util.ts:190-191) and the service worker falls
 * back to a relative `icon.svg` (public/sw.js:29,45). If that file is not
 * there, the browser fetches it, gets a 404, and the notification arrives
 * without its mark - which is what the sysop saw as
 * `GET /vite.svg 404` and `GET /favicon.ico 404`.
 *
 * The icon was WRITTEN to fix exactly that, with a comment in it saying so -
 * and never committed. It sat untracked on one machine, so it was in nobody's
 * build and 404ed on live while the source looked correct. A test that only
 * asked "does the file exist" would have passed on that machine and nowhere
 * else, which is this repository's oldest trap
 * (`tests/repo/tracked-fixtures.test.ts` exists for the same reason).
 *
 * So this asserts the file is TRACKED BY GIT, not merely present.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const ICON = 'web/config-app/public/icon.svg';

function isTracked(rel: string): boolean {
  try {
    execFileSync('git', ['-C', REPO, 'ls-files', '--error-unmatch', rel], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('the push notification icon', () => {
  it('is on disk', () => {
    expect(fs.existsSync(path.join(REPO, ICON))).toBe(true);
  });

  it('is TRACKED - present on one machine is how it 404ed on live', () => {
    expect(isTracked(ICON)).toBe(true);
  });

  it('is a real SVG, not a placeholder', () => {
    const svg = fs.readFileSync(path.join(REPO, ICON), 'utf8');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg.length).toBeGreaterThan(200);
  });

  it('is named the way the sender and the service worker both ask for it', () => {
    // The backend sends an absolute path under the admin's base; the worker
    // falls back to a relative one. Both resolve to this file, and if either
    // name changes without the other, the notification loses its icon again.
    const util = fs.readFileSync(
      path.join(REPO, 'web/backend/src/utils/web-push.util.ts'), 'utf8');
    expect(util).toContain('/admin/icon.svg');

    const sw = fs.readFileSync(path.join(REPO, 'web/config-app/public/sw.js'), 'utf8');
    expect(sw).toContain('icon.svg');
  });
});
