/**
 * Door corpus regression test. Runs `dev/scripts/door-corpus/run.ts`
 * which boots each manifest door under the existing
 * `run-amiga-door.ts` harness and diffs stdout + a normalized trap
 * trace against frozen goldens.
 *
 * Skips cleanly when the corpus runner isn't reachable from the
 * sandbox (CI environments without the harness or without a tsx
 * binary). Enable in CI with `RUN_DOOR_CORPUS=1`.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const RUNNER = path.join(REPO_ROOT, 'dev/scripts/door-corpus/run.ts');
const CORPUS = path.join(REPO_ROOT, 'dev/scripts/door-corpus/corpus.json');

const skip = process.env.SKIP_DOOR_CORPUS === '1';
const runnerExists = fs.existsSync(RUNNER);
const corpusExists = fs.existsSync(CORPUS);
const enabled = !skip && runnerExists && corpusExists;

const describeMaybe = enabled ? describe : describe.skip;

describeMaybe('door corpus', () => {
  // Single jest case per corpus run — the runner reports per-door status
  // in its stdout and exits non-zero on any mismatch. We surface that
  // output in the assertion message so a fail is actionable.
  it('all doors diff clean against goldens', () => {
    const result = spawnSync('npx', ['tsx', RUNNER], {
      cwd: REPO_ROOT,
      env: { ...process.env, FORCE_COLOR: '0' },
      encoding: 'utf8',
      timeout: 5 * 60 * 1000, // 5 min hard cap; per-door timeouts live in corpus.json
    });
    const combined = `${result.stdout || ''}\n${result.stderr || ''}`;
    if (result.status !== 0) {
      throw new Error(
        `corpus runner exit=${result.status}\n` +
        `--- combined output ---\n${combined}`,
      );
    }
    // Sanity: at least one door ran. The runner's exit code already
    // signals pass/fail; the extra summary check guards against a
    // future change to the runner that fails silently.
    expect(combined).toMatch(/\[corpus\] \d+ door\(s\)/);
    // Failure modes that should not appear in the summary tally:
    // "fail=N", "error=N", "timeout=N" (uppercase token to avoid
    // matching the per-entry "timeout=NNNNms" progress line).
    expect(combined).not.toMatch(/(?:^|\s)(fail|error|timeout)=\d+(?:\s|$)/m);
  }, 6 * 60 * 1000);
});
