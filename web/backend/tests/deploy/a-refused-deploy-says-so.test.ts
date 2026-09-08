/**
 * A deploy that cannot start must SAY so, and must not look like success.
 *
 * The lock preamble was `exec flock --nonblock "$LOCK_FILE" "$0" "$@" || {
 * echo ...; exit 75; }`. `exec` REPLACES the shell with flock, so the `||`
 * branch after it can never run: when another deploy held the lock, flock
 * exited 1, nothing was printed, and the script ended.
 *
 * On 2026-09-08 that cost an hour. A deploy was run, reported exit 0 - the
 * caller had piped it through `tail`, whose exit status won - and the board
 * did not move; the container was 35 minutes older than the deploy that
 * claimed to have built it. The lock was doing its job perfectly and saying
 * nothing about it.
 *
 * These drive the real `deploy/deploy.sh` with a `flock` shim on PATH, so the
 * script can never reach its deploy body: the shim reports the conflict and
 * nothing is built, pulled or restarted. That also lets the test run on a
 * developer's macOS, which has no `flock` at all.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REPO = path.resolve(__dirname, '../../../..');
const DEPLOY = path.join(REPO, 'deploy/deploy.sh');

/** A PATH whose `flock` always reports the lock as held, with the given code. */
function pathWithFlockShim(exitCode: number): { env: NodeJS.ProcessEnv; cleanup: () => void } {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'flock-shim-'));
  fs.writeFileSync(path.join(bin, 'flock'), `#!/bin/sh\nexit ${exitCode}\n`, { mode: 0o755 });
  return {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, DEPLOY_LOCK_HELD: '' },
    cleanup: () => fs.rmSync(bin, { recursive: true, force: true }),
  };
}

function runDeploy(env: NodeJS.ProcessEnv): { status: number; stderr: string; stdout: string } {
  try {
    const stdout = execFileSync('bash', [DEPLOY], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { status: 0, stdout, stderr: '' };
  } catch (err: any) {
    return { status: err.status ?? -1, stdout: String(err.stdout ?? ''), stderr: String(err.stderr ?? '') };
  }
}

describe('the deploy refuses to run beside another one', () => {
  it('exists as a file the host can run without GitHub', () => {
    // The reason this script exists at all: Actions stopped running for this
    // repository and held the only copy of the deploy.
    expect(fs.existsSync(DEPLOY)).toBe(true);
  });

  it('says the lock is held, instead of exiting in silence', () => {
    const { env, cleanup } = pathWithFlockShim(75);
    try {
      const { status, stderr } = runDeploy(env);

      // THE REGRESSION. With `exec flock`, this message was unreachable.
      expect(stderr).toContain('another deploy holds');
      expect(status).toBe(75);
    } finally {
      cleanup();
    }
  });

  it('does not mistake a failed deploy for a held lock', () => {
    // flock returns the COMMAND's status when it does acquire. Without
    // --conflict-exit-code, a deploy that failed with 1 and a lock that was
    // held both came back as 1, and the log could not tell them apart.
    const { env, cleanup } = pathWithFlockShim(1);
    try {
      const { status, stderr } = runDeploy(env);

      expect(status).toBe(1);
      expect(stderr).not.toContain('another deploy holds');
    } finally {
      cleanup();
    }
  });
});
