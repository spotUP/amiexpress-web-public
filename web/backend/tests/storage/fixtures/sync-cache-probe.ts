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
}

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
function runOnTheEmulatorThread({ cache, backend, dir }: Fixture): Omit<ProbeResult, 'writeBackSyncBytes'> {
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
    ensureLocalSyncBytes: fs.readFileSync(fetched, 'utf8'),
    dirtyAfterSuccess: cache.isDirty(2, 'Files/DOOR.DAT'),
    writeBackSyncFailureIsUnavailable: writeFailure instanceof StorageUnavailableError,
    dirtyAfterFailure: cache.isDirty(2, 'Files/STRANDED.DAT'),
    stagedFileSurvivedFailure: fs.existsSync(stranded),
    ensureLocalSyncFailureIsUnavailable: fetchFailure instanceof StorageUnavailableError,
  };
}

build().then(
  (fixture) => {
    setImmediate(() => {
      let partial: Omit<ProbeResult, 'writeBackSyncBytes'>;
      try {
        partial = runOnTheEmulatorThread(fixture);
      } catch (err) {
        process.stderr.write(`${String(err)}\n`);
        process.exit(1);
        return;
      }
      fixture.backend.get('Files/DOOR.DAT').then(
        (body) => {
          process.stdout.write(`${JSON.stringify({ ...partial, writeBackSyncBytes: body.toString() })}\n`);
          process.exit(0);
        },
        (err: unknown) => {
          process.stderr.write(`${String(err)}\n`);
          process.exit(1);
        }
      );
    });
  },
  (err: unknown) => {
    process.stderr.write(`${String(err)}\n`);
    process.exit(1);
  }
);
