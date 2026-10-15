import { execFileSync } from 'child_process';
import * as path from 'path';

/**
 * Task 10's brief sketches `DosLibrary.Open()`/`Close()` calling
 * `FileCache.ensureLocalSync`/`writeBackSync` directly, with the comment
 * "Blocking here is correct: this is the emulator thread, and it is exactly
 * how BsdSocketLibrary.recv() waits." That comparison does not hold: recv()'s
 * wakeup is a plain synchronous socket callback that `uv_run` dispatches
 * regardless of microtask draining, while `ensureLocalSync`/`writeBackSync`
 * are `async function`s whose continuations need `deasync.loopWhile`'s
 * `process._tickCallback()` drain to make ANY progress - and that drain is
 * exactly what file-cache.ts documents as unavailable "from inside a `.then()`,
 * or an `async` function after an `await`".
 *
 * The one place a real door's Open()/Close() is dispatched from is
 * `DoorLifecycleManager.runExecutionLoop` (the only execution driver for a
 * 68K door started through `LibraryManager`, whose `enableNewFileSystem` call
 * at LibraryManager.ts:550 is unconditional - so `FileManager.open()/close()`,
 * not `DosLibrary`'s own legacy Open()/Close(), is the real body). That loop's
 * shape is exactly the illegal one: `checkAndHandleLibraryTrap` (and so every
 * DOS call) runs from inside the body of an `async` function, after
 * `await new Promise((resolve) => setImmediate(resolve))`
 * (DoorLifecycleManager.ts:605), with per-trap yields deliberately removed
 * (DoorTrapDispatcher.ts:263-266) so most dispatches are several statements
 * past that last await, not the callback of a fresh `setImmediate`.
 *
 * This runs the REAL `FileCache.ensureLocalSync` from that exact shape, out
 * of process for the same reason `file-cache-sync.test.ts` does (jest's VM
 * sandbox cannot drain `deasync.loopWhile` at all, so even the healthy
 * control has to run under plain node) - and shows it never drains: it hits
 * its bounded deadline and raises `StorageUnavailableError` even though the
 * object is a `FakeBackend.get()` away, with nothing slow about it.
 *
 * THIS IS WHY TASK 10 DID NOT WIRE THE SYNC CALLS INTO DosLibrary/FileManager.
 * Shipping the brief's sketch as-is would turn every pooled-area Open()/
 * Close() into a guaranteed ~30s board-wide stall (the whole emulator thread
 * parks), not an occasional one - see file-cache.ts's own note that this
 * parks "every node, every session and every socket on the board". If a
 * future change makes this probe pass (loopShapeThrew: false), the safety
 * argument above no longer holds and the sync calls can be wired directly;
 * until then, wiring needs the loop to run the dispatch from inside a real
 * `setImmediate` callback for the pooled-path case specifically, which is a
 * change to the shared trap-dispatch loop and needs its own review, not a
 * unilateral change bundled into a storage task.
 */
describe('DosLibrary Open()/Close(), dispatched the way runExecutionLoop actually calls it', () => {
  it('cannot drain FileCache.ensureLocalSync even for an object the backend already has', () => {
    const backendRoot = path.resolve(__dirname, '../..');
    const tsx = path.join(backendRoot, 'node_modules', '.bin', 'tsx');
    const probe = path.join(__dirname, 'fixtures', 'door-trap-loop-continuation-probe.ts');

    const stdout = execFileSync(tsx, [probe], {
      cwd: backendRoot,
      encoding: 'utf8',
      timeout: 30_000,
    });

    const lines = stdout.trim().split('\n');
    const result: unknown = JSON.parse(lines[lines.length - 1]);

    expect(result).toEqual({
      // Control: the shape already proven safe by sync-cache-probe.ts -
      // called synchronously inside a setImmediate callback body.
      controlDrainedBytes: 'from-the-bucket',
      controlMs: expect.any(Number),
      // The shape under test: runExecutionLoop's actual dispatch context.
      // It never drains the fetch, so it rides the bound to its deadline and
      // raises - it does not return the bytes the way the control call did.
      loopShapeThrew: true,
      loopShapeWasStorageUnavailable: true,
      loopShapeMs: expect.any(Number),
    });

    const parsed = result as { controlMs: number; loopShapeMs: number };
    // The control settles promptly; the loop shape rides its 1500ms bound to
    // the deadline rather than returning early with the (already-available)
    // bytes - the discriminating signature of a drain that never happens
    // rather than one that is merely slow.
    expect(parsed.controlMs).toBeLessThan(500);
    expect(parsed.loopShapeMs).toBeGreaterThanOrEqual(1500);
  }, 40_000);
});
