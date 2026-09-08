/**
 * /health names a commit in a DEV checkout, not just in the image.
 *
 * The rule that keeps localhost level with live - compare
 * `curl localhost:3001/health` with `curl https://bbs.uprough.net/health`
 * (RULES.md, "The shared checkout tracks origin/main") - needs both ends to
 * answer with a commit. A dev checkout has no /app/.git-sha, so /health said
 * `revision: unknown` and the check could not be made; on 2026-09-08 the
 * shared checkout had been 157 commits behind live for days and nothing said
 * so.
 *
 * The image's own .git-sha still wins where it exists: that is what the
 * deploy writes and what the guard reads.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { _readGitHead, _readGitShaFromPath, getRepoRevision } from '../../src/server/repo-revision';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function tinyRepo(): { dir: string; sha: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rev-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 'T');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-q', '-m', 'one');
  return { dir, sha: git(dir, 'rev-parse', 'HEAD') };
}

describe('the revision a dev checkout reports', () => {
  it('is the checkout HEAD, found from a directory deep inside it', () => {
    const { dir, sha } = tinyRepo();
    const deep = path.join(dir, 'web', 'backend', 'src', 'server');
    fs.mkdirSync(deep, { recursive: true });
    expect(_readGitHead(deep)).toBe(sha);
  });

  it('follows a worktree, whose .git is a file and whose refs live in the main repository', () => {
    const { dir } = tinyRepo();
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'rev-wt-'));
    fs.rmSync(wt, { recursive: true, force: true });
    git(dir, 'worktree', 'add', '-q', '-b', 'side', wt);
    try {
      expect(fs.statSync(path.join(wt, '.git')).isFile()).toBe(true);
      expect(_readGitHead(wt)).toBe(git(wt, 'rev-parse', 'HEAD'));
    } finally {
      git(dir, 'worktree', 'remove', '--force', wt);
    }
  });

  it('reads a packed ref, as a freshly cloned checkout has', () => {
    const { dir, sha } = tinyRepo();
    git(dir, 'pack-refs', '--all');
    expect(fs.existsSync(path.join(dir, '.git', 'refs', 'heads', 'main'))).toBe(false);
    expect(_readGitHead(dir)).toBe(sha);
  });

  it('says unknown where there is neither an image file nor a git directory', () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'rev-none-'));
    expect(_readGitHead(bare)).toBe('unknown');
    expect(_readGitShaFromPath(path.join(bare, 'nope'))).toBe('unknown');
  });

  it("the running backend's own /health revision is this checkout's HEAD", () => {
    // The real call, from the real module: in this repo it must name a commit.
    expect(getRepoRevision()).toMatch(/^[0-9a-f]{40}$/);
  });
});
