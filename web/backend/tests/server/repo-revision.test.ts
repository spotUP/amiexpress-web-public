/**
 * repo-revision.ts is the single source of truth for the git-SHA-derived
 * "revision" string reported by both /health (app.ts) and the door-repo
 * manifest builder (door-repo-manifest.ts). It must stay a pure fs/env
 * module (no express imports) so it can be imported outside the HTTP
 * stack and unit-tested directly — unlike app.ts itself, which pulls in
 * the whole express/helmet/cors/log-stream stack at import time (see
 * tests/health-revision.test.ts, which tests app.ts's /health revision
 * wiring via source-grep for exactly that reason).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  _readGitShaFromPath,
  getRepoRevision,
  _clearRepoRevisionCacheForTests,
} from '../../src/server/repo-revision';

describe('repo-revision', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-revision-'));
    _clearRepoRevisionCacheForTests();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    _clearRepoRevisionCacheForTests();
  });

  describe('_readGitShaFromPath', () => {
    it('reads and trims the SHA when the git-sha file is present', () => {
      const file = path.join(tmpDir, 'git-sha');
      fs.writeFileSync(file, 'abc123def456\n');
      expect(_readGitShaFromPath(file)).toBe('abc123def456');
    });

    it('falls back to "unknown" when the file is absent', () => {
      const file = path.join(tmpDir, 'does-not-exist');
      expect(_readGitShaFromPath(file)).toBe('unknown');
    });

    it('falls back to "unknown" when the file is present but empty', () => {
      const file = path.join(tmpDir, 'empty-git-sha');
      fs.writeFileSync(file, '');
      expect(_readGitShaFromPath(file)).toBe('unknown');
    });
  });

  describe('getRepoRevision', () => {
    it('falls back to "unknown" outside a built image (no /app/.git-sha on a dev machine)', () => {
      expect(getRepoRevision()).toBe('unknown');
    });

    it('memoizes the result across calls', () => {
      const a = getRepoRevision();
      const b = getRepoRevision();
      expect(b).toBe(a);
    });

    it('_clearRepoRevisionCacheForTests forces a re-read', () => {
      const a = getRepoRevision();
      _clearRepoRevisionCacheForTests();
      const b = getRepoRevision();
      expect(b).toBe(a); // same underlying source (/app/.git-sha absent here) -> same value
      expect(b).toBe('unknown');
    });
  });
});
