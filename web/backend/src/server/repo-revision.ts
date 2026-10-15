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
 * at image build time. A DEV checkout has no such file, so it reads the
 * working tree's own HEAD instead: "localhost can never be behind the live
 * site" (sysop, 2026-09-08, after the shared checkout had drifted 157
 * commits behind), and the rule that keeps it true - compare
 * `curl localhost:3001/health` with `curl https://bbs.uprough.net/health` -
 * needs both ends to name a commit. `unknown` remains the answer only when
 * there is neither a built image nor a git directory.
 */
import * as fs from 'fs';
import * as path from 'path';

const GIT_SHA_PATH = '/app/.git-sha';

/**
 * HEAD of the checkout this file is running from, read the way git stores
 * it: `.git/HEAD` is either a sha or `ref: refs/heads/<branch>`, whose sha
 * is in `.git/<ref>` or, once packed, in `.git/packed-refs`. A worktree's
 * `.git` is a FILE pointing at the real directory. No child process: a
 * health endpoint must not shell out.
 */
export function _readGitHead(startDir: string): string {
  try {
    let dir = startDir;
    for (let up = 0; up < 8; up++) {
      const dotGit = path.join(dir, '.git');
      if (fs.existsSync(dotGit)) {
        const stat = fs.statSync(dotGit);
        const gitDir = stat.isDirectory()
          ? dotGit
          : path.resolve(dir, fs.readFileSync(dotGit, 'utf-8').replace(/^gitdir:\s*/, '').trim());
        const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf-8').trim();
        if (!head.startsWith('ref:')) return head;
        const ref = head.slice(4).trim();
        const loose = path.join(gitDir, ref);
        if (fs.existsSync(loose)) return fs.readFileSync(loose, 'utf-8').trim();
        // A worktree's refs live in the main repository's directory.
        const common = path.join(gitDir, 'commondir');
        if (fs.existsSync(common)) {
          const root = path.resolve(gitDir, fs.readFileSync(common, 'utf-8').trim());
          const there = path.join(root, ref);
          if (fs.existsSync(there)) return fs.readFileSync(there, 'utf-8').trim();
          const packed = path.join(root, 'packed-refs');
          if (fs.existsSync(packed)) {
            const line = fs.readFileSync(packed, 'utf-8').split('\n').find((l) => l.endsWith(` ${ref}`));
            if (line) return line.split(' ')[0]!;
          }
        }
        const packed = path.join(gitDir, 'packed-refs');
        if (fs.existsSync(packed)) {
          const line = fs.readFileSync(packed, 'utf-8').split('\n').find((l) => l.endsWith(` ${ref}`));
          if (line) return line.split(' ')[0]!;
        }
        return 'unknown';
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch { /* no git here */ }
  return 'unknown';
}

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
  const fromImage = _readGitShaFromPath(GIT_SHA_PATH);
  _cachedGitSha = fromImage !== 'unknown' ? fromImage : _readGitHead(__dirname);
  return _cachedGitSha;
}

export function _clearRepoRevisionCacheForTests(): void {
  _cachedGitSha = null;
}
