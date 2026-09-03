/**
 * Exercises FileCache's two emulator-thread methods for real.
 *
 * It lives outside the jest suite and is spawned by `file-cache-sync.test.ts`
 * because `deasync.loopWhile` cannot drain promise continuations from inside
 * jest's VM sandbox - the same limitation `jh-sf-sync-emit.test.ts` documents
 * for the trap-sync XIMProcessor. A source-shaped pin would prove only that
 * the calls exist, so this runs the real thing under plain node and reports
 * what happened as one JSON line on stdout.
 *
 * The sync calls are made from a `setImmediate` callback, not from inside the
 * `.then()` that set the fixture up. That is not a stylistic choice: see the
 * "MACROTASK ONLY" note on `FileCache.ensureLocalSync`. Running them from a
 * promise continuation deadlocks node outright, which is exactly what this
 * probe would otherwise demonstrate by hanging.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileCache } from '../../../src/storage/file-cache';
import { VolumeSet, type VolumeState } from '../../../src/storage/volume-set';
import { StorageUnavailableError } from '../../../src/storage/storage-backend';
import { FakeBackend } from '../fake-backend';

interface Fixture {
  cache: FileCache;
  backend: FakeBackend;
  dir: string;
}

interface ProbeResult {
  ensureLocalSyncBytes: string;
  writeBackSyncBytes: string;
  dirtyAfterSuccess: boolean;
  writeBackSyncFailureIsUnavailable: boolean;
  dirtyAfterFailure: boolean;
  stagedFileSurvivedFailure: boolean;
  ensureLocalSyncFailureIsUnavailable: boolean;
  /** The macrotask (legal) shape settles promptly, nowhere near its timeout. */
  macrotaskWorkIsPrompt: boolean;
  /** The microtask (illegal) shape RAISES instead of hanging the board for ever. */
  microtaskShapeRaisesUnavailable: boolean;
  /** ...and does so at its deadline, not after an unbounded wait. */
  microtaskShapeBounded: boolean;
}

const SHORT_TIMEOUT_MS = 400;

type MacrotaskResult = Omit<
  ProbeResult,
  'writeBackSyncBytes' | 'microtaskShapeRaisesUnavailable' | 'microtaskShapeBounded'
>;

async function build(): Promise<Fixture> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'filecache-sync-'));
  const backend = new FakeBackend({ driveNumber: 2 });
  const state: VolumeState = {
    volume: { driveNumber: 2, kind: 's3', path: 'b', egress: 'FREE', volumeClass: 'FREE', quotaBytes: 4096 },
    backend,
    usedBytes: 0,
    requestsThisMonth: 0,
    egressBytesThisMonth: 0,
    degraded: false,
  };
  const volumes = new VolumeSet([state]);
  const cache = new FileCache({ cacheDir: dir, volumes, maxBytes: 4096 });
  await backend.put('Files/DEMO.LHA', Buffer.from('payload'));
  return { cache, backend, dir };
}

/** Everything here runs on one synchronous stretch, the way a trap handler does. */
function runOnTheEmulatorThread({ cache, backend, dir }: Fixture): MacrotaskResult {
  const startedAt = Date.now();
  const fetched = cache.ensureLocalSync(2, 'Files/DEMO.LHA');

  const closed = path.join(dir, 'closed-by-a-door.bin');
  fs.writeFileSync(closed, 'written-then-closed');
  cache.writeBackSync(2, 'Files/DOOR.DAT', closed);

  const stranded = path.join(dir, 'closed-while-down.bin');
  fs.writeFileSync(stranded, 'precious');
  backend.down = true;

  let writeFailure: unknown;
  try {
    cache.writeBackSync(2, 'Files/STRANDED.DAT', stranded);
  } catch (err) {
    writeFailure = err;
  }

  let fetchFailure: unknown;
  try {
    cache.ensureLocalSync(2, 'Files/COLD.LHA');
  } catch (err) {
    fetchFailure = err;
  }
  backend.down = false;

  return {
    // Well under the 30 s default: the bounding timer did not become the
    // thing that ends a healthy call.
    macrotaskWorkIsPrompt: Date.now() - startedAt < 5_000,
    ensureLocalSyncBytes: fs.readFileSync(fetched, 'utf8'),
    dirtyAfterSuccess: cache.isDirty(2, 'Files/DOOR.DAT'),
    writeBackSyncFailureIsUnavailable: writeFailure instanceof StorageUnavailableError,
    dirtyAfterFailure: cache.isDirty(2, 'Files/STRANDED.DAT'),
    stagedFileSurvivedFailure: fs.existsSync(stranded),
    ensureLocalSyncFailureIsUnavailable: fetchFailure instanceof StorageUnavailableError,
  };
}

/** A second cache whose sync deadline is short enough to observe. */
async function buildShortTimeout(): Promise<FileCache> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'filecache-short-'));
  const backend = new FakeBackend({ driveNumber: 2 });
  const state: VolumeState = {
    volume: { driveNumber: 2, kind: 's3', path: 'b', egress: 'FREE', volumeClass: 'FREE', quotaBytes: 4096 },
    backend,
    usedBytes: 0,
    requestsThisMonth: 0,
    egressBytesThisMonth: 0,
    degraded: false,
  };
  await backend.put('Files/DEMO.LHA', Buffer.from('payload'));
  return new FileCache({
    cacheDir: dir,
    volumes: new VolumeSet([state]),
    maxBytes: 4096,
    syncTimeoutMs: SHORT_TIMEOUT_MS,
  });
}

/**
 * The ILLEGAL shape, on purpose: a sync call reached from inside a promise
 * continuation. `process._tickCallback()` refuses to re-enter itself there, so
 * nothing drains and the loop falls through to `uv_run`. Unbounded, this hangs
 * the whole board for ever. Bounded - an armed timer to wake `uv_run` plus a
 * deadline in the predicate, the shape every other deasync loop in this
 * backend uses - it must give up and RAISE.
 */
function runFromAPromiseContinuation(cache: FileCache): { raised: boolean; bounded: boolean } {
  const startedAt = Date.now();
  let raised = false;
  try {
    cache.ensureLocalSync(2, 'Files/DEMO.LHA');
  } catch (err) {
    raised = err instanceof StorageUnavailableError;
  }
  const elapsed = Date.now() - startedAt;
  return { raised, bounded: elapsed < SHORT_TIMEOUT_MS * 10 };
}

function emit(result: ProbeResult): void {
  process.stdout.write(`${JSON.stringify(result)}\n`, () => process.exit(0));
}

function die(err: unknown): void {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
}

build().then((fixture) => {
  // Phase 1: the legal shape - a macrotask, the way a trap handler reaches it.
  setImmediate(() => {
    let macrotask: MacrotaskResult;
    try {
      macrotask = runOnTheEmulatorThread(fixture);
    } catch (err) {
      die(err);
      return;
    }
    fixture.backend.get('Files/DOOR.DAT').then((body) => {
      // Phase 2, strictly after phase 1 so nothing nests inside a parked loop.
      buildShortTimeout().then((short) => {
        const microtask = runFromAPromiseContinuation(short);
        emit({
          ...macrotask,
          writeBackSyncBytes: body.toString(),
          microtaskShapeRaisesUnavailable: microtask.raised,
          microtaskShapeBounded: microtask.bounded,
        });
      }, die);
    }, die);
  });
}, die);
