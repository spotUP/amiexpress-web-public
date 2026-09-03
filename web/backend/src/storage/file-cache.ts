/**
 * Local disk as a cache in front of the pool.
 *
 * The rule the whole design rests on: THE CACHE MAY NEVER DELETE THE ONLY COPY
 * OF ANYTHING. A file whose upload has not succeeded is DIRTY, is pinned
 * against eviction, and is recorded so a crash mid-upload resumes instead of
 * losing the write.
 *
 * The pin is recorded TWICE, on purpose, because a pin that lives in one
 * shared file is a pin that a corrupt parse, a failed write or a cross-process
 * lost update can silently drop - and the file it was protecting is then
 * indistinguishable from a clean cached copy that the pool already has:
 *
 *   - a SIDECAR MARKER, `<localPath>.dirty`, written beside the staged file
 *     before the upload is attempted and removed only once the upload lands.
 *     It is per-file, so nothing another process does can erase it, and
 *     `evictTo` treats any file carrying one as pinned. It also carries enough
 *     to rebuild the journal entry, so a cache whose journal is gone still
 *     RETRIES the upload rather than merely declining to delete it.
 *
 *   - the JOURNAL, one JSON file listing every pending upload, which is what
 *     `flushPending` walks at boot. When it cannot be trusted - it parsed as
 *     corrupt, or a marker could not be written - `evictTo` stops deleting
 *     anything at all until the next restart. A cache over its budget costs
 *     disk; a cache that deleted the only copy of a file costs the file.
 *
 * `evictTo` also only ever deletes a file it could FETCH AGAIN - one that
 * lives at the `<cacheDir>/<driveNumber>/<key>` path `localPathFor` produces.
 * Anything else under the cache directory is somebody else's file.
 *
 * And "the volume cannot answer" and "the object is not there" are different
 * answers and stay different all the way out of this module.
 * `StorageUnavailableError` means ask again later; only a genuinely absent
 * object is absence. A fetch failure that reaches a caller as not-found is how
 * a sysop ends up deleting catalog rows for files that were fine.
 */
import * as deasync from 'deasync';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import type { VolumeSet } from './volume-set';
import { StorageUnavailableError } from './storage-backend';

/** A file the cache has materialised on local disk. */
export interface CachedFile {
  localPath: string;
  driveNumber: number;
  key: string;
}

/** One unfinished upload, as it is written to and read back from the journal. */
export interface PendingEntry {
  driveNumber: number;
  key: string;
  localPath: string;
}

/**
 * What a sidecar marker holds. The size and mtime are the staged file as it
 * stood when the marker went down, and they exist for one case: nothing is
 * fsynced before rename, so a power loss can leave a staged file
 * PRESENT-BUT-TRUNCATED with its marker intact. Adopting that blindly uploads
 * the short file over a perfectly good object and then removes the marker, so
 * the good bytes are gone with nothing recording it. On disagreement recovery
 * parks the file instead - loudly, still pinned, never uploaded.
 */
export interface DirtyMarker extends PendingEntry {
  size?: number;
  mtimeMs?: number;
}

export interface FileCacheOptions {
  cacheDir: string;
  volumes: VolumeSet;
  maxBytes: number;
  /**
   * How long the emulator-thread forms may block before giving up. Defaults to
   * the 30 s `BsdSocketLibrary.recv()` allows itself. Tests use a short one.
   */
  syncTimeoutMs?: number;
}

/** Matches `BsdSocketLibrary.recv()` and `AmiSSLLibrary`, which both use 30 s. */
export const DEFAULT_SYNC_TIMEOUT_MS = 30_000;

export type BlockOutcome = 'value' | 'failure' | 'timeout';

/**
 * What a bounded wait decides when its loop stops - and deliberately CLOCK
 * FREE.
 *
 * The obvious formulation reads the clock, and it is wrong in both directions.
 * `done` is set by the fulfil handler AND by the bounding timer, so it cannot
 * tell success from expiry on its own; `setTimeout` fires when
 * `now - start >= N`, so `Date.now()` can read exactly the deadline. Deciding
 * on `!done || Date.now() > deadline` then returns the never-assigned result -
 * `undefined` handed back as a file path - on a call that timed out, and, in
 * the mirror case, reports an upload that SUCCEEDED as unavailable after its
 * marker was removed, its journal entry dropped and its bytes charged to the
 * volume. The door is told the write failed when it landed.
 *
 * So the decision reads only what the handlers set. That sliver of a
 * millisecond is a race by nature and cannot be reproduced in wall-clock time;
 * making it unreachable is better than trying to test it.
 */
export function blockOutcome(succeeded: boolean, failed: boolean): BlockOutcome {
  if (failed) return 'failure';
  return succeeded ? 'value' : 'timeout';
}

/**
 * `instanceof` is not a reliable classifier under this repo's jest: a module
 * evaluated in one VM realm produces errors that fail `instanceof` against
 * another realm's constructor, which is why `local-backend.ts` classifies fs
 * errno errors with `util.types.isNativeError` plus a `code` check instead.
 * The same hazard applies to a StorageUnavailableError thrown by a backend
 * that reached this module through a different realm, and getting it wrong
 * here is expensive in exactly the way the module header warns about: an
 * unavailable volume that is not recognised as unavailable is not marked
 * degraded, and its error travels on unlabelled. So the class check has a
 * name-based fallback rather than standing alone.
 */
export function isStorageUnavailable(err: unknown): err is StorageUnavailableError {
  if (err instanceof StorageUnavailableError) return true;
  return (
    util.types.isNativeError(err) &&
    (err as Error).name === 'StorageUnavailableError' &&
    'driveNumber' in (err as object)
  );
}

/** Only a digits-only first segment can be a drive directory this cache wrote. */
const DRIVE_DIR_PATTERN = /^\d+$/;

/**
 * Scratch names this module writes and must never mistake for payload: the
 * `.tmp-<pid>-<n>` files a download and a journal save rename from, and the
 * `.dirty` marker that pins a staged file.
 *
 * Skipping them in the eviction walk costs a real object whose key genuinely
 * ends `.dirty` or `.tmp-1-2` its eligibility for eviction. That is
 * over-pinning - wasted disk, never a lost file - and is the same trade
 * `LocalBackend`'s TEMP_SUFFIX_PATTERN makes for the same reason.
 */
const TEMP_SUFFIX_PATTERN = /\.tmp-(\d+)-\d+$/;
const MARKER_SUFFIX = '.dirty';

let tempCounter = 0;

export class FileCache {
  private readonly cacheDir: string;
  private readonly volumes: VolumeSet;
  private readonly maxBytes: number;
  private readonly syncTimeoutMs: number;

  /** Unfinished uploads, keyed by `${driveNumber}:${key}`. Pinned, journalled. */
  private readonly dirty = new Map<string, PendingEntry>();

  /** One fetch per cold key, shared by every caller racing for it. */
  private readonly inFlight = new Map<string, Promise<string>>();

  /**
   * Last use, in this process, of a materialised path. Layered over the
   * filesystem's atime because relatime and noatime mounts make atime a poor
   * LRU signal, and the cache directory is exactly the kind of place a sysop
   * mounts with noatime.
   */
  private readonly lastUsed = new Map<string, number>();

  /**
   * Bytes each key is believed to occupy on its volume because THIS process
   * uploaded it. Overwriting a key replaces the object rather than adding to
   * it, so the previous size is credited back before the new one is charged -
   * the same correction `FakeBackend.put` makes. Without it a door that
   * rewrites its .DAT once a minute inflates `usedBytes` until `place()`
   * refuses uploads to a bucket with room.
   */
  private readonly uploadedSizes = new Map<string, number>();

  /**
   * Set when the record of what is pinned is known to be incomplete - a
   * journal that parsed as corrupt, or a marker that could not be written.
   * While it is set `evictTo` deletes nothing. Deliberately never cleared
   * within a process: the entries a corrupt journal held are gone, and this
   * process cannot know which files they named. A restart with a readable
   * journal starts trusting again.
   */
  private journalUntrusted = false;

  private shortfallBytes = 0;
  private warnedEvictionDisabled = false;
  private warnedShortfall = false;

  constructor(opts: FileCacheOptions) {
    this.cacheDir = opts.cacheDir;
    this.volumes = opts.volumes;
    this.maxBytes = opts.maxBytes;
    this.syncTimeoutMs = opts.syncTimeoutMs ?? DEFAULT_SYNC_TIMEOUT_MS;
    fs.mkdirSync(this.cacheDir, { recursive: true });
    this.loadJournal();
    this.recoverFromDisk();
  }

  // ---------------------------------------------------------------- journal

  private get journalPath(): string {
    return path.join(this.cacheDir, '.pending.json');
  }

  private readJournalFromDisk(): PendingEntry[] {
    let raw: string;
    try {
      raw = fs.readFileSync(this.journalPath, 'utf8');
    } catch {
      return []; // no journal yet, or it cannot be read - neither stops the board
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('journal is not an array');
      return parsed.filter((e): e is PendingEntry => isPendingEntry(e));
    } catch {
      // A corrupt journal must not stop the board - but it must stop eviction.
      // Entries it held are unrecoverable from here, and a staged file one of
      // them named sits at exactly the <drive>/<key> path `evictTo` would
      // otherwise consider a clean, re-fetchable copy.
      this.journalUntrusted = true;
      console.warn(
        `[storage] cache journal at ${this.journalPath} is unreadable; eviction is disabled until restart ` +
          `and pending uploads must be re-run by hand`
      );
      return [];
    }
  }

  /**
   * Loads EVERY entry, including ones another node wrote.
   *
   * That is deliberate. An entry only reaches the journal once its file is
   * complete - `writeBack` is called after the writer is done - so replaying
   * a foreign entry uploads finished bytes, never a half-written file. And
   * holding it in `dirty` pins the other node's staged copy against this
   * node's eviction, which is the whole point.
   */
  private loadJournal(): void {
    for (const entry of this.readJournalFromDisk()) {
      this.dirty.set(this.id(entry.driveNumber, entry.key), entry);
    }
  }

  /**
   * Read-merge-write, never blind-write.
   *
   * The journal sits at a fixed path inside the cache directory, and two nodes
   * of one board share that directory. A process that serialised only its own
   * in-memory map would erase the other node's pending entries; the other node
   * would then be holding the only copy of a file that nothing on disk records
   * as dirty. On-disk entries are therefore carried through every save, and
   * the write is a temp-file rename so a crash mid-save cannot leave a
   * truncated journal.
   *
   * `justResolved` is the ONE id this save is removing - the upload that just
   * landed, or the entry whose staged file has gone. Nothing else is dropped.
   * A durable "already resolved" set would be wrong: it would go on
   * suppressing that id for the life of the process, so a second node staging
   * the same key again later would have its fresh entry deleted by this
   * process's next save - the very loss the merge exists to prevent.
   */
  private saveJournal(justResolved?: string): void {
    const merged = new Map<string, PendingEntry>();
    for (const entry of this.readJournalFromDisk()) {
      const id = this.id(entry.driveNumber, entry.key);
      if (id === justResolved) continue;
      merged.set(id, entry);
    }
    for (const [id, entry] of this.dirty) merged.set(id, entry);

    const tmp = `${this.journalPath}.tmp-${process.pid}-${tempCounter++}`;
    try {
      fs.writeFileSync(tmp, JSON.stringify([...merged.values()], null, 2));
      fs.renameSync(tmp, this.journalPath);
    } catch (err) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // nothing to clean up
      }
      // Throwing here would turn a successful upload into a failure and a
      // failed upload into a lost pin. The sidecar markers still pin every
      // staged file, and eviction is off while the record is incomplete.
      this.journalUntrusted = true;
      console.warn(`[storage] cannot write cache journal ${this.journalPath}: ${String(err)}`);
    }
  }

  // ------------------------------------------------------- sidecar markers

  private markerPathFor(localPath: string): string {
    return `${localPath}${MARKER_SUFFIX}`;
  }

  /**
   * Writes the per-file pin. It goes down BEFORE the upload is attempted and
   * comes up only once the bytes are in the pool, so at no instant is a staged
   * file both unrecorded and un-uploaded.
   */
  private writeMarker(entry: PendingEntry): void {
    try {
      fs.mkdirSync(path.dirname(entry.localPath), { recursive: true });
      const marker: DirtyMarker = { ...entry, ...this.stampOf(entry.localPath) };
      fs.writeFileSync(this.markerPathFor(entry.localPath), JSON.stringify(marker));
    } catch (err) {
      // Warn, but do NOT disable eviction. This process's own record is
      // intact - `dirty` holds the entry and `markDirty` journals it
      // immediately - so nothing here is unsafe to evict. Disabling would
      // deadlock the board in exactly the case eviction is the remedy for:
      // ENOSPC fails the marker write, eviction switches off permanently, and
      // the disk never recovers. What is lost is the pin's ability to outlive
      // a lost journal, which is a degraded guarantee, not an unsafe one.
      console.warn(
        `[storage] cannot write dirty marker for ${entry.localPath}: ${String(err)}; ` +
          `this upload is recorded only in the journal until it lands`
      );
    }
  }

  /** Size and mtime of the staged file, or nothing if it cannot be stat'd. */
  private stampOf(localPath: string): { size?: number; mtimeMs?: number } {
    try {
      const st = fs.statSync(localPath);
      return { size: st.size, mtimeMs: st.mtimeMs };
    } catch {
      // The writer has not created it yet. Recovery will park rather than
      // replay a file it cannot vouch for.
      return {};
    }
  }

  /**
   * Whether the staged file is still byte-for-byte what the marker was written
   * for. A marker with no stamp - written before the file existed, or by an
   * older build - cannot vouch for anything and answers no.
   */
  private markerMatchesFile(marker: DirtyMarker, stagedPath: string): boolean {
    if (marker.size === undefined || marker.mtimeMs === undefined) return false;
    try {
      const st = fs.statSync(stagedPath);
      return st.size === marker.size && st.mtimeMs === marker.mtimeMs;
    } catch {
      return false;
    }
  }

  private removeMarker(localPath: string): void {
    try {
      fs.unlinkSync(this.markerPathFor(localPath));
    } catch {
      // Already gone, which is the desired end state.
    }
  }

  /**
   * One boot-time walk that does two jobs the journal cannot.
   *
   * It ADOPTS any sidecar marker whose entry the journal does not have - a
   * journal that was corrupt, unwritable, or clobbered by another node leaves
   * exactly that, and adopting turns "do not delete these bytes" into "upload
   * these bytes", which is what was wanted all along - but only when the
   * staged file still matches the marker's stamp. It PARKS the file when it
   * does not, and REMOVES a marker whose file is gone.
   *
   * And it sweeps `.tmp-<pid>-<n>` scratch left by a process that died between
   * writing a download and renaming it. Only temps whose pid is no longer
   * running are removed, so a second node's in-flight download is never pulled
   * out from under its own rename.
   */
  private recoverFromDisk(): void {
    const adopted: PendingEntry[] = [];
    const parked: string[] = [];

    this.walkFiles(this.cacheDir, (full, name) => {
      const temp = TEMP_SUFFIX_PATTERN.exec(name);
      if (temp) {
        if (!isProcessAlive(Number(temp[1]))) {
          try {
            fs.unlinkSync(full);
          } catch {
            // Someone else got there first.
          }
        }
        return;
      }
      if (!name.endsWith(MARKER_SUFFIX)) return;

      // The marker sits beside its file, so the file's path is derived from
      // the marker's own location rather than trusted from its contents - it
      // is right even for a marker too corrupt to parse.
      const stagedPath = full.slice(0, -MARKER_SUFFIX.length);
      if (!fs.existsSync(stagedPath)) {
        // There are no bytes left to protect, and leaving the marker is not
        // harmless: `evictTo` skips markers, so the next cold fetch of this
        // key lands a perfectly clean copy at exactly this path and it is
        // un-evictable for the life of the cache directory, across every
        // restart. Nothing else ever removes one.
        try {
          fs.unlinkSync(full);
        } catch {
          // Someone else got there first.
        }
        console.warn(`[storage] removed dirty marker ${full}: the staged file it protected is gone`);
        return;
      }

      const marker = this.readMarker(full);
      if (!marker) return; // unreadable: still pinned by existing, not replayable
      const id = this.id(marker.driveNumber, marker.key);
      if (this.dirty.has(id)) return;

      if (!this.markerMatchesFile(marker, stagedPath)) {
        // Present but not what was staged - the truncated-by-a-power-loss
        // case. Uploading it would destroy a good object in the pool. Park it:
        // the marker stays, so the file stays pinned, and nothing replays it
        // until a person looks.
        parked.push(stagedPath);
        return;
      }

      this.dirty.set(id, { driveNumber: marker.driveNumber, key: marker.key, localPath: stagedPath });
      adopted.push({ driveNumber: marker.driveNumber, key: marker.key, localPath: stagedPath });
    });

    if (parked.length > 0) {
      console.warn(
        `[storage] ${parked.length} staged file(s) do not match the marker that was written for them and will NOT be ` +
          `uploaded - they are kept and pinned pending a sysop: ${parked.join(', ')}`
      );
    }

    if (adopted.length > 0) {
      console.warn(
        `[storage] recovered ${adopted.length} pending upload(s) from sidecar markers that the journal did not list: ` +
          adopted.map((e) => this.id(e.driveNumber, e.key)).join(', ')
      );
      this.saveJournal();
    }
  }

  private readMarker(markerPath: string): DirtyMarker | null {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
      return isPendingEntry(parsed) ? (parsed as DirtyMarker) : null;
    } catch {
      // A marker we cannot read still pins its file by existing - `evictTo`
      // checks for the file, not for its contents - it just cannot be
      // replayed. Say so rather than dropping it silently.
      console.warn(`[storage] dirty marker ${markerPath} is unreadable; its file stays pinned but cannot be replayed`);
      return null;
    }
  }

  private walkFiles(dir: string, visit: (full: string, name: string) => void): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.walkFiles(full, visit);
      } else if (entry.isFile()) {
        visit(full, entry.name);
      }
    }
  }

  // -------------------------------------------------------------- key paths

  private id(driveNumber: number, key: string): string {
    return `${driveNumber}:${key}`;
  }

  /**
   * A key is a pool object name, not a path the caller may steer. Without this
   * a key of `../../etc/passwd` would have the cache write outside its own
   * directory - and, worse for the one rule that matters, would have `evictTo`
   * consider a file outside the cache to be a file the cache owns.
   */
  private assertSafeKey(key: string): void {
    if (key === '' || key === '.') {
      throw new Error('cache key must not be empty - an empty key resolves to the cache directory itself');
    }
    if (path.isAbsolute(key)) {
      throw new Error(`cache key must be relative, got an absolute path: ${key}`);
    }
    if (key.split(/[\\/]+/).includes('..')) {
      throw new Error(`cache key may not contain ".." segments: ${key}`);
    }
  }

  /**
   * Where this object lives on local disk. This is also where a writer should
   * STAGE bytes it means to upload: Task 10 opens this path for a door and
   * hands the same path back to `writeBackSync` on Close(), which puts the
   * staged file inside the `<drive>/<key>` layout where the pin, the marker
   * and the re-fetchability rule all apply to it.
   */
  localPathFor(driveNumber: number, key: string): string {
    this.assertSafeKey(key);
    return path.join(this.cacheDir, String(driveNumber), key);
  }

  /**
   * The id of the object a path holds, or null when this is not a file the
   * cache materialised and could therefore fetch again. Null is the answer
   * that keeps a file alive through `evictTo`.
   */
  private materialisedIdFor(full: string): string | null {
    const rel = path.relative(this.cacheDir, full);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
    const parts = rel.split(path.sep);
    if (parts.length < 2) return null;
    if (!DRIVE_DIR_PATTERN.test(parts[0])) return null;
    return this.id(Number(parts[0]), parts.slice(1).join('/'));
  }

  isDirty(driveNumber: number, key: string): boolean {
    return this.dirty.has(this.id(driveNumber, key));
  }

  /** Bytes the last `evictTo` could not reclaim because everything left is pinned. */
  overBudgetBytes(): number {
    return this.shortfallBytes;
  }

  /** Whether the pin record is incomplete, which disables eviction. */
  isEvictionDisabled(): boolean {
    return this.journalUntrusted;
  }

  // ------------------------------------------------------------- read paths

  /**
   * The local path holding this object's current bytes, fetching it if the
   * cache does not have it.
   *
   * Resolution order, and why:
   *   1. A DIRTY entry wins. Its staged file is newer than anything the pool
   *      holds - that is what "not uploaded yet" means - and it is the only
   *      copy of that version. Serving the pool's older bytes here would make
   *      a door's own write disappear from under it.
   *   2. A materialised copy wins next, EVEN WHEN THE VOLUME IS DEGRADED. The
   *      bytes on disk are real; the volume being unreachable says nothing
   *      about them, and refusing a download the board can serve from disk
   *      because a bucket is having a bad minute helps nobody.
   *   3. A fetch already running for this key is shared rather than doubled.
   *   4. Otherwise, fetch.
   *
   * Throws `StorageUnavailableError` when the volume cannot answer. A
   * genuinely absent object throws whatever the backend throws for absence
   * (raw ENOENT from LocalBackend, a NoSuchKey-derived error from S3), and
   * that distinction is the caller's to keep - see the module header.
   */
  async ensureLocal(driveNumber: number, key: string): Promise<string> {
    const id = this.id(driveNumber, key);
    const local = this.localPathFor(driveNumber, key); // validates the key first

    const pending = this.dirty.get(id);
    if (pending && fs.existsSync(pending.localPath)) {
      this.lastUsed.set(path.resolve(pending.localPath), Date.now());
      return pending.localPath;
    }

    if (fs.existsSync(local)) {
      this.lastUsed.set(path.resolve(local), Date.now());
      return local;
    }

    const already = this.inFlight.get(id);
    if (already) return already;

    const run: Promise<string> = this.fetch(driveNumber, key, local).finally(() => {
      // Identity-guarded: only clear the entry this call put there.
      if (this.inFlight.get(id) === run) this.inFlight.delete(id);
    });
    this.inFlight.set(id, run);
    return run;
  }

  private async fetch(driveNumber: number, key: string, local: string): Promise<string> {
    const state = this.volumes.byNumber(driveNumber);
    if (!state) throw new StorageUnavailableError(driveNumber, `DRIVE.${driveNumber} is not configured`);

    let body: Buffer;
    try {
      body = await state.backend.get(key);
    } catch (error) {
      // A volume that cannot answer is degraded: placement stops choosing it
      // and the admin shows why. The catalog row is untouched - this is not a
      // missing file, and nothing downstream may treat it as one. An error
      // that is NOT an unavailability (a real absence) leaves the volume's
      // health alone: the volume answered perfectly well, with "no".
      if (isStorageUnavailable(error)) this.volumes.markDegraded(driveNumber, true);
      throw error;
    }
    this.volumes.markDegraded(driveNumber, false);

    // Temp file then rename, the way LocalBackend.put does: a crash or a full
    // disk mid-download must never leave a short file that the next
    // ensureLocal serves as a complete one. The name carries this process's
    // pid so the eviction walk skips it and a later boot can tell an orphan
    // from a live download.
    fs.mkdirSync(path.dirname(local), { recursive: true });
    const tmp = `${local}.tmp-${process.pid}-${tempCounter++}`;
    try {
      fs.writeFileSync(tmp, body);
      fs.renameSync(tmp, local);
    } catch (err) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // nothing to clean up
      }
      throw err;
    }

    state.requestsThisMonth++;
    state.egressBytesThisMonth += body.length;
    this.lastUsed.set(path.resolve(local), Date.now());
    return local;
  }

  /**
   * Runs a promise to completion on the calling thread, BOUNDED.
   *
   * Every other deasync loop in this backend arms a timer before spinning -
   * `BsdSocketLibrary.recv()` at :713, `AmiSSLLibrary` at :552,
   * `door-message-callbacks` at :194 and :503 - and the two mechanisms here
   * are NOT interchangeable.
   *
   * `loopWhile` is `while (pred()) { drain ticks; uv_run(loop, UV_RUN_ONCE); }`
   * and UV_RUN_ONCE blocks in the poll phase until some handle is ready,
   * capped by the nearest due timer. So:
   *
   *   - THE TIMER IS LOAD-BEARING. A live uv_timer caps the poll timeout, so
   *     the loop is bounded in every case, including the one that matters in
   *     production - a real S3 socket parked in epoll_wait that never answers.
   *   - The deadline in the predicate is a BACKSTOP for the timer callback not
   *     being delivered. With nothing pollable, uv_run returns instantly and
   *     the deadline stops a hot spin; but with a live handle that never
   *     fires, uv_run stays in poll and the predicate is not re-evaluated
   *     until something unrelated happens to wake it. Measured with the timer
   *     removed and a listening socket in the loop: a 400 ms deadline overran
   *     to roughly 9 s. The deadline alone does not bound anything usefully.
   *
   * Note it is the timer HANDLE that caps the poll, not its callback - with
   * the callback stubbed out but the timer still armed, the wait stays inside
   * its deadline. The callback flipping `done` is belt and braces on top.
   *
   * Unbounded - neither of them - the deadlock described on `ensureLocalSync`
   * is permanent and takes the whole board with it, rather than failing one
   * door's file operation.
   *
   * Expiry raises `StorageUnavailableError`: a volume that did not answer in
   * time is exactly "ask again later", and for a write-back the entry is
   * already journalled and marked, so raising loses nothing.
   */
  private blockOn<T>(driveNumber: number, operation: string, work: Promise<T>): T {
    let result: T | undefined;
    let failure: unknown;
    let succeeded = false;
    let failed = false;
    let done = false;

    work.then(
      (value) => {
        result = value;
        succeeded = true;
        done = true;
      },
      (error: unknown) => {
        failure = error;
        failed = true;
        done = true;
      }
    );

    const deadline = Date.now() + this.syncTimeoutMs;
    const timer = setTimeout(() => {
      done = true;
    }, this.syncTimeoutMs);

    deasync.loopWhile(() => !done && Date.now() < deadline);
    clearTimeout(timer);

    switch (blockOutcome(succeeded, failed)) {
      case 'failure':
        throw failure;
      case 'timeout':
        throw new StorageUnavailableError(
          driveNumber,
          `${operation} did not finish within ${this.syncTimeoutMs}ms on DRIVE.${driveNumber}`
        );
      default:
        return result as T;
    }
  }

  /**
   * The emulator's form of `ensureLocal`. It blocks with `deasync.loopWhile`
   * the way `BsdSocketLibrary.recv()` does at BsdSocketLibrary.ts:717, timer
   * and all.
   *
   * TWO RULES, both load-bearing:
   *
   * 1. EMULATOR THREAD ONLY. Called from an Express handler this does not
   *    merely block that request - it parks the shared event loop, which is
   *    every node, every session and every socket on the board.
   *
   * 2. MACROTASK ONLY. It must be reached from a timer, an immediate, or an
   *    I/O callback - never from inside a promise continuation (the body of a
   *    `.then()`, or an `async` function after an `await`). `loopWhile` drains
   *    pending work by calling `process._tickCallback()`, and that function
   *    refuses to re-enter itself; from inside a microtask checkpoint it
   *    returns without draining anything and `loopWhile` falls through to
   *    `uv_run`. Measured, not assumed: the same call settles in 0 ms at top
   *    level or from `setImmediate` and never settles from inside a `.then()`.
   *    The timer above turns that from a permanent hang into a bounded failure,
   *    but it is still a failure - a caller in async code must use
   *    `ensureLocal` instead.
   */
  ensureLocalSync(driveNumber: number, key: string): string {
    return this.blockOn(driveNumber, `fetching ${key}`, this.ensureLocal(driveNumber, key));
  }

  // ------------------------------------------------------------ write paths

  /**
   * Records that a local file holds bytes the pool does not have yet. From
   * this moment the file is pinned against eviction - by its own sidecar
   * marker, not only by the shared journal - and will be retried at every boot
   * until it lands.
   */
  markDirty(driveNumber: number, key: string, localPath: string): void {
    this.assertSafeKey(key);
    const entry: PendingEntry = { driveNumber, key, localPath };
    // Marker first. It is the record that survives everything the journal
    // cannot, so it must exist before the upload is attempted.
    this.writeMarker(entry);
    this.dirty.set(this.id(driveNumber, key), entry);
    this.saveJournal();
  }

  /**
   * Uploads a staged local file to its volume.
   *
   * Dirty FIRST, upload second. A crash between the two resumes; a crash the
   * other way round loses the write with nothing on disk recording that it
   * was ever owed.
   */
  async writeBack(driveNumber: number, key: string, localPath: string): Promise<void> {
    this.markDirty(driveNumber, key, localPath);
    const id = this.id(driveNumber, key);

    const state = this.volumes.byNumber(driveNumber);
    if (!state) throw new StorageUnavailableError(driveNumber, `DRIVE.${driveNumber} is not configured`);

    const body = fs.readFileSync(localPath);
    try {
      await state.backend.put(key, body);
    } catch (error) {
      if (isStorageUnavailable(error)) this.volumes.markDegraded(driveNumber, true);
      // Re-assert the entry on disk before giving up: another node may have
      // rewritten the journal between markDirty and here, and this file is
      // now the only copy of these bytes.
      this.saveJournal();
      throw error; // the entry stays dirty, marked, and on disk
    }
    this.volumes.markDegraded(driveNumber, false);

    const previous = this.uploadedSizes.get(id) ?? 0;
    state.usedBytes += body.length - previous;
    this.uploadedSizes.set(id, body.length);
    state.requestsThisMonth++;

    // Marker down before the journal entry: the bytes are in the pool now, so
    // unpinning is safe, and a crash in between leaves the journal entry to
    // drive one harmless idempotent retry rather than a marker nothing ever
    // clears.
    this.removeMarker(localPath);
    this.dirty.delete(id);
    this.saveJournal(id);
  }

  /**
   * `writeBack` for the emulator thread, blocking the same way
   * `ensureLocalSync` does and carrying BOTH of its restrictions: emulator
   * thread only, and macrotask only. Read that note before calling this.
   *
   * Task 10 calls it from `DosLibrary.Close()`, where a door that has just
   * written a file and reopens it expects to read back what it wrote - which
   * means the upload has to have been attempted before Close() returns. On
   * timeout it raises rather than hanging; the entry is already journalled and
   * marked, so the bytes are safe and the next boot finishes the job.
   */
  writeBackSync(driveNumber: number, key: string, localPath: string): void {
    this.blockOn(driveNumber, `uploading ${key}`, this.writeBack(driveNumber, key, localPath));
  }

  /** Retries every unfinished upload. Called at boot. */
  async flushPending(): Promise<void> {
    for (const entry of [...this.dirty.values()]) {
      const id = this.id(entry.driveNumber, entry.key);
      if (!fs.existsSync(entry.localPath)) {
        // Nothing left to upload. Keeping the entry would pin a path that no
        // longer exists and retry it for ever.
        this.dirty.delete(id);
        this.removeMarker(entry.localPath);
        this.saveJournal(id);
        console.warn(`[storage] pending upload ${id} has no staged file at ${entry.localPath}; dropping it`);
        continue;
      }
      try {
        await this.writeBack(entry.driveNumber, entry.key, entry.localPath);
      } catch {
        // Still unavailable. It stays pending and pinned; the next boot tries
        // again.
      }
    }
    this.saveJournal();
  }

  // --------------------------------------------------------------- eviction

  /**
   * Brings the cache down to `maxBytes` by deleting files it could fetch
   * again, least recently used first.
   *
   * What it will NOT do: run at all while the pin record is incomplete; delete
   * a file carrying a sidecar marker; delete a dirty file; or delete anything
   * that is not laid out as `<cacheDir>/<driveNumber>/<key>`. If everything
   * left is pinned, the cache stays over budget and says so -
   * `overBudgetBytes()` reports the excess and a warning names it. That is the
   * correct outcome: a cache over its budget costs disk, and a cache that
   * deleted the only copy of a file costs the file. An operator seeing a
   * persistent shortfall is being told the pool has stopped accepting writes,
   * which is the thing to fix.
   */
  evictTo(maxBytes: number = this.maxBytes): void {
    const files = this.scanForEviction();
    let total = files.reduce((sum, f) => sum + f.size, 0);

    if (this.journalUntrusted) {
      // The number still has to be right. `overBudgetBytes()` is the one value
      // an admin surface would plot, and freezing it at its last reading -
      // usually 0 - exactly while the disk fills is worse than not having it.
      this.shortfallBytes = Math.max(0, total - maxBytes);
      if (!this.warnedEvictionDisabled) {
        this.warnedEvictionDisabled = true;
        console.warn(
          '[storage] eviction is disabled: the record of which files are not yet uploaded is incomplete, ' +
            'so no file can be proven safe to delete'
        );
      }
      return;
    }

    for (const file of files.filter((f) => f.evictable).sort((a, b) => a.used - b.used)) {
      if (total <= maxBytes) break;
      try {
        fs.unlinkSync(file.full);
      } catch {
        continue; // could not remove it; it still counts against the budget
      }
      this.lastUsed.delete(path.resolve(file.full));
      total -= file.size;
    }

    this.shortfallBytes = Math.max(0, total - maxBytes);
    if (this.shortfallBytes === 0) {
      // Back inside budget: a later recurrence is worth saying out loud again.
      this.warnedShortfall = false;
      return;
    }
    if (this.warnedShortfall) return; // once per episode - a per-call warning is noise operators filter out
    this.warnedShortfall = true;
    console.warn(
      `[storage] cache is ${this.shortfallBytes} bytes over its ${maxBytes} byte budget and cannot shrink further: ` +
        `${this.dirty.size} file(s) have not been uploaded yet and will not be deleted`
    );
  }

  private scanForEviction(): Array<{ full: string; size: number; used: number; evictable: boolean }> {
    const pinnedPaths = new Set([...this.dirty.values()].map((e) => path.resolve(e.localPath)));
    const journal = path.resolve(this.journalPath);

    const files: Array<{ full: string; size: number; used: number; evictable: boolean }> = [];

    this.walkFiles(this.cacheDir, (full, name) => {
      const resolved = path.resolve(full);
      if (resolved === journal) return;
      // Scratch and pins, not payload. A download's temp file must survive the
      // walk or a concurrent eviction unlinks it out from under its own
      // rename; a marker must survive it or the pin deletes itself.
      if (TEMP_SUFFIX_PATTERN.test(name)) return;
      if (name.endsWith(MARKER_SUFFIX)) return;

      let size: number;
      let atime: number;
      try {
        const st = fs.statSync(full);
        size = st.size;
        atime = st.atimeMs;
      } catch {
        return; // vanished under us; nothing to account for
      }

      const id = this.materialisedIdFor(full);
      const evictable =
        id !== null &&
        !this.dirty.has(id) &&
        !pinnedPaths.has(resolved) &&
        !fs.existsSync(this.markerPathFor(full));
      files.push({ full, size, used: Math.max(atime, this.lastUsed.get(resolved) ?? 0), evictable });
    });

    return files;
  }
}

function isPendingEntry(value: unknown): value is PendingEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as PendingEntry;
  return (
    typeof entry.driveNumber === 'number' &&
    typeof entry.key === 'string' &&
    typeof entry.localPath === 'string'
  );
}

/**
 * Signal 0 tests for existence without delivering anything. EPERM means the
 * process is there but owned by someone else, which is still alive - only
 * ESRCH means gone. Used so a boot never sweeps another live node's in-flight
 * download temp.
 */
function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return util.types.isNativeError(err) && (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}
