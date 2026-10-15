/**
 * Decisive probe for Task 10: does `FileCache.ensureLocalSync` actually drain
 * when called the way a real 68K door's Open() trap is dispatched?
 *
 * `DoorLifecycleManager.runExecutionLoop` (session/DoorLifecycleManager.ts) is
 * the ONE execution driver for every 68K door started through
 * `LibraryManager` (the "C or assembly under MOIRA" case Task 10 targets;
 * `enableNewFileSystem` is called unconditionally at LibraryManager.ts:550, so
 * `FileManager.open()/close()` - not `DosLibrary`'s own legacy Open()/Close() -
 * is the real Open/Close body for every such door). Its shape is:
 *
 *   while (this.executionState.isRunning) {                         // :598
 *     if (now - lastYieldTime >= YIELD_INTERVAL_MS) {
 *       await new Promise((resolve) => setImmediate(resolve));      // :605
 *     }
 *     ...
 *     const trapHandled = this.trapDispatcher.checkAndHandleLibraryTrap(pc); // :912
 *     ...
 *   }
 *
 * `checkAndHandleLibraryTrap` -> `handleTrap` -> `DosLibrary`/`FileManager`
 * Open()/Close() is a fully synchronous call chain, reached from inside the
 * body of `runExecutionLoop`'s async function, typically many trap dispatches
 * after the last `await new Promise((resolve) => setImmediate(resolve))` -
 * per-trap yields were deliberately removed (DoorTrapDispatcher.ts:263-266,
 * "REMOVED: Per-trap setImmediate was causing severe slowdown for 68K
 * doors... causes 'slow motion' output").
 *
 * `FileCache.ensureLocalSync`/`writeBackSync` (file-cache.ts:838-861,
 * :929-942) are documented MACROTASK ONLY: reached from a promise
 * continuation, `deasync.loopWhile`'s underlying `process._tickCallback()`
 * cannot drain the awaited fetch/put, so the call never settles inside its
 * own timeout and instead throws `StorageUnavailableError` at the deadline
 * every single time - not intermittently.
 *
 * This probe reproduces the loop's exact shape (not a paraphrase of it) and
 * calls the REAL `FileCache.ensureLocalSync` against an object the backend
 * already has, so a healthy drain would return near-instantly. It also runs
 * the one shape already proven safe (`sync-cache-probe.ts`'s `setImmediate`
 * callback body) against the identical cache, as the control.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileCache } from '../../../src/storage/file-cache';
import { VolumeSet, type VolumeState } from '../../../src/storage/volume-set';
import { StorageUnavailableError } from '../../../src/storage/storage-backend';
import { FakeBackend } from '../fake-backend';

interface ProbeResult {
  /** The KNOWN-GOOD shape: called synchronously from inside a setImmediate callback. */
  controlDrainedBytes: string;
  controlMs: number;
  /** The shape `runExecutionLoop` actually uses for every trap dispatch. */
  loopShapeThrew: boolean;
  loopShapeWasStorageUnavailable: boolean;
  loopShapeMs: number;
}

async function build(): Promise<{ cache: FileCache; dir: string }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-trap-loop-'));
  const backend = new FakeBackend({ driveNumber: 2 });
  const state: VolumeState = {
    volume: { driveNumber: 2, kind: 's3', path: 'b', egress: 'FREE', volumeClass: 'FREE', quotaBytes: 4096 },
    backend,
    usedBytes: 0,
    requestsThisMonth: 0,
    egressBytesThisMonth: 0,
    degraded: false,
  };
  const cache = new FileCache({ cacheDir: dir, volumes: new VolumeSet([state]), maxBytes: 4096, syncTimeoutMs: 1500 });
  await backend.put('Conf1/Files/DOOR.DAT', Buffer.from('from-the-bucket'));
  return { cache, dir };
}

/**
 * `runExecutionLoop`'s actual shape: an `await new Promise((resolve) =>
 * setImmediate(resolve))` yield gate, followed - several statements and one
 * "trap dispatch" later, exactly as `checkAndHandleLibraryTrap` sits after
 * the yield at DoorLifecycleManager.ts:605-912 - by the synchronous call
 * `DosLibrary.Open()` would make into `cache.ensureLocalSync()`.
 */
async function callTheWayTheLoopWould(cache: FileCache, key: string): Promise<string> {
  await new Promise((resolve) => setImmediate(resolve)); // :605
  // Everything `runExecutionLoop` does between the yield gate and the trap
  // dispatch (exit-condition checks, debug-monitor probes, XIM-poll flag
  // checks) is synchronous, non-yielding work - reproduced here as a no-op
  // loop so nothing here itself yields before the dispatch.
  for (let i = 0; i < 5; i++) { /* stand-in for the loop's synchronous steps */ }
  return cache.ensureLocalSync(2, key); // :912 -> handleTrap -> Open()
}

function emit(result: ProbeResult): void {
  process.stdout.write(`${JSON.stringify(result)}\n`, () => process.exit(0));
}

function die(err: unknown): void {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
}

build().then(({ cache }) => {
  setImmediate(() => {
    // Control: the known-good shape (sync-cache-probe.ts's own pattern) -
    // called directly inside a setImmediate callback, nothing awaited first.
    const controlStart = Date.now();
    let controlLocal: string;
    try {
      controlLocal = cache.ensureLocalSync(2, 'Conf1/Files/DOOR.DAT');
    } catch (err) {
      die(err);
      return;
    }
    const controlMs = Date.now() - controlStart;
    const controlDrainedBytes = fs.readFileSync(controlLocal, 'utf8');

    // The shape under test, against a FRESH cache with nothing materialised
    // locally yet - a genuinely cold fetch, exactly like a door's first
    // Open() of a pooled file.
    build().then(({ cache: freshCache }) => {
      const loopStart = Date.now();
      callTheWayTheLoopWould(freshCache, 'Conf1/Files/DOOR.DAT')
        .then((local) => {
          emit({
            controlDrainedBytes,
            controlMs,
            loopShapeThrew: false,
            loopShapeWasStorageUnavailable: false,
            loopShapeMs: Date.now() - loopStart,
          });
          void local;
        })
        .catch((err) => {
          emit({
            controlDrainedBytes,
            controlMs,
            loopShapeThrew: true,
            loopShapeWasStorageUnavailable: err instanceof StorageUnavailableError,
            loopShapeMs: Date.now() - loopStart,
          });
        });
    }, die);
  });
}, die);
