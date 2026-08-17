/**
 * Single source of truth for the "repo revision" string surfaced by both
 * the `/health` endpoint (web/backend/src/server/app.ts) and the door-repo
 * manifest builder (web/backend/src/doors/door-repo-manifest.ts).
 *
 * Deliberately has NO express/helmet/cors imports and no other side
 * effects at module load — it is pure fs + a hardcoded path, so it can be
 * imported by non-server modules (like the door-repo manifest) without
 * dragging in the whole HTTP stack, and unit-tested directly (unlike
 * app.ts, which pulls in the entire middleware stack at import time — see
 * tests/health-revision.test.ts's source-grep comment for why that file
 * tests app.ts by reading its text instead of importing it).
 *
 * /app/.git-sha is written by the Dockerfile (RUN echo ... > /app/.git-sha)
 * at image build time. Local dev / any environment without that file
 * falls back to 'unknown'.
 */
import * as fs from 'fs';

const GIT_SHA_PATH = '/app/.git-sha';

let _cachedGitSha: string | null = null;

/**
 * Reads and trims the git SHA from an arbitrary file path, falling back to
 * 'unknown' if the file is missing/unreadable or empty. Exported (only)
 * so tests can exercise the present/absent branches against a temp file
 * without touching the real /app/.git-sha path. Production code should
 * call getRepoRevision(), not this directly.
 */
export function _readGitShaFromPath(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8').trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Memoized repo revision — the same value /health reports. */
export function getRepoRevision(): string {
  if (_cachedGitSha !== null) return _cachedGitSha;
  _cachedGitSha = _readGitShaFromPath(GIT_SHA_PATH);
  return _cachedGitSha;
}

export function _clearRepoRevisionCacheForTests(): void {
  _cachedGitSha = null;
}
