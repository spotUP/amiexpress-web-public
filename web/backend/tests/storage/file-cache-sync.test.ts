import { execFileSync } from 'child_process';
import * as path from 'path';

/**
 * The emulator-thread forms of ensureLocal / writeBack cannot be exercised
 * inside jest: `deasync.loopWhile` parks the thread in `uv_run` and jest's VM
 * sandbox never hands it back, so the test hangs rather than fails - the same
 * limitation `tests/amiga-emulation/jh-sf-sync-emit.test.ts` records for the
 * trap-sync XIMProcessor.
 *
 * A structural pin on the source would prove only that the deasync call is
 * written down, not that it returns. So the real methods run in a child
 * process under plain node, from a macrotask, and report what happened.
 */
describe('FileCache emulator-thread forms (out of process)', () => {
  it('ensureLocalSync and writeBackSync complete, and carry unavailability through', () => {
    const backendRoot = path.resolve(__dirname, '../..');
    const tsx = path.join(backendRoot, 'node_modules', '.bin', 'tsx');
    const probe = path.join(__dirname, 'fixtures', 'sync-cache-probe.ts');

    const stdout = execFileSync(tsx, [probe], {
      cwd: backendRoot,
      encoding: 'utf8',
      timeout: 90_000,
    });

    const lines = stdout.trim().split('\n');
    const result: unknown = JSON.parse(lines[lines.length - 1]);

    expect(result).toEqual({
      // It blocked until the bytes were on local disk, and they are the right bytes.
      ensureLocalSyncBytes: 'payload',
      // Close() uploaded before it returned, so a reopen sees what was written.
      writeBackSyncBytes: 'written-then-closed',
      dirtyAfterSuccess: false,
      // A volume that cannot answer stays "ask again later" through the sync
      // wrapper, and the only copy is kept and pinned.
      writeBackSyncFailureIsUnavailable: true,
      dirtyAfterFailure: true,
      stagedFileSurvivedFailure: true,
      ensureLocalSyncFailureIsUnavailable: true,
    });
  }, 120_000);
});
