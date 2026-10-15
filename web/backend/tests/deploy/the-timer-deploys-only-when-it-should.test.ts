/**
 * What makes a push reach the board, now that Actions does not.
 *
 * A timer ticks every two minutes and asks two questions: has origin/main
 * moved, and is anybody on the board. Both matter, and the ORDER matters most:
 * `deploy.sh` builds the image before it consults the caller guard - right for
 * a human running it once, because the image is then ready the moment the
 * board empties, and wrong for a timer, which would rebuild the same image
 * thirty times while one caller sat on the board for an hour. Eight minutes of
 * CPU each, on the box that also runs the BBS.
 *
 * So the decision is a function, and this drives it directly.
 */
import { execFileSync } from 'child_process';
import * as path from 'path';

const watcher = path.join(__dirname, '..', '..', '..', '..', 'deploy', 'watch-main.sh');

/**
 * `up-to-date`, `callers`, or `deploy`.
 *
 * The first argument is what the BOARD IS RUNNING, not what the checkout says.
 * Comparing the checkout was the first version and it was wrong: the host sat
 * with HEAD at a5f8b7d8b while the container served 5a0e4852d, and a watcher
 * asking the checkout would have called that up to date for ever.
 */
function decide(runningSha: string, remoteSha: string, health: unknown, ignore = 'spot sysop'): string {
  const json = typeof health === 'string' ? health : JSON.stringify(health);
  return execFileSync('bash', [
    '-c',
    `DEPLOY_ROOT="$1" DEPLOY_IGNORE_CALLERS="$5" . "$1/deploy/watch-main.sh"; deploy_decision "$2" "$3" "$4"`,
    'bash',
    path.join(__dirname, '..', '..', '..', '..'),
    runningSha, remoteSha, json, ignore,
  ], { encoding: 'utf8' }).trim();
}

const online = (...users: string[]) => ({
  status: 'ok',
  revision: 'whatever',
  callers: users.length,
  online: users.map((username, i) => ({ username, nodeId: i + 1, transport: 'web' })),
});

describe('the deploy timer', () => {
  it('asks what the BOARD runs, not what the checkout says', () => {
    // The live shape that caught this: checkout ahead, container behind.
    expect(decide('5a0e4852d', 'a5f8b7d8b', online())).toBe('deploy');
  });

  it('does nothing when the board is already on origin/main', () => {
    expect(decide('abc123', 'abc123', online())).toBe('up-to-date');
    // Even with a caller on: there is nothing to deploy.
    expect(decide('abc123', 'abc123', online('tango'))).toBe('up-to-date');
  });

  it('deploys when main has moved and nobody is on', () => {
    expect(decide('abc123', 'def456', online())).toBe('deploy');
  });

  it('waits - without building - while a real caller is on', () => {
    expect(decide('abc123', 'def456', online('607080'))).toBe('callers');
  });

  it('does not wait for the sysop', () => {
    // "its always ok to force when spot or the sysop is online" (2026-09-08).
    expect(decide('abc123', 'def456', online('sysop'))).toBe('deploy');
    expect(decide('abc123', 'def456', online('spot'))).toBe('deploy');
  });

  it('treats a fetch that answered nothing as nothing to do', () => {
    // A network blip must not read as "main moved to the empty string".
    expect(decide('abc123', '', online())).toBe('up-to-date');
  });

  it('treats an unreachable board as empty, which is a cold start', () => {
    // /health not answering means no BBS is running: deploy it.
    expect(decide('abc123', 'def456', '')).toBe('deploy');
  });
});
