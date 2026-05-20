/**
 * Regression: /health endpoint must include a `revision` field that
 * surfaces the git SHA embedded at image build time (via Dockerfile
 * ARG GIT_SHA → /app/.git-sha). Monitoring relies on this to verify
 * "is the deploy actually fresh?" without inspecting docker image
 * mtimes (which can lie when an old container restarts).
 *
 * Grep-style — app.ts pulls in the whole express + middleware stack
 * and can't be unit-loaded under jest.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('/health revision field (ops: deploy freshness)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'server', 'app.ts'),
    'utf-8'
  );

  test('/health handler exists', () => {
    expect(src).toMatch(/app\.get\(['"]\/health['"]/);
  });

  test('reads /app/.git-sha to source the revision string', () => {
    expect(src).toMatch(/['"]\/app\/\.git-sha['"]/);
  });

  test('falls back to "unknown" if the file is missing (local dev)', () => {
    expect(src).toMatch(/unknown/);
  });

  test('/health response includes a revision field', () => {
    const m = src.match(/app\.get\(['"]\/health['"][\s\S]*?res\.json\([\s\S]*?\}\)/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/revision\s*:/);
  });

  test('SHA read is cached (avoid statSync per request)', () => {
    // _cachedGitSha pattern — checked once, memoized.
    expect(src).toMatch(/_cachedGitSha/);
  });
});
