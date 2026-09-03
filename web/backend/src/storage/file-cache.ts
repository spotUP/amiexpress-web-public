/**
 * Local disk as a cache in front of the pool.
 *
 * The rule the whole design rests on: THE CACHE MAY NEVER DELETE THE ONLY COPY
 * OF ANYTHING. A file whose upload has not succeeded is DIRTY, is pinned
 * against eviction, and is recorded in a journal so a crash mid-upload resumes
 * instead of losing the write.
 *
 * Two rules follow from it, and both are enforced here rather than trusted to
 * callers:
 *
 *   - `evictTo` only ever deletes a file it could FETCH AGAIN - one that lives
 *     at the `<cacheDir>/<driveNumber>/<key>` path `localPathFor` produces and
 *     is not dirty. Anything else under the cache directory is somebody else's
 *     file and is left alone, even when that leaves the cache over budget.
 *
 *   - "the volume cannot answer" and "the object is not there" are different
 *     answers and stay different all the way out of this module.
 *     `StorageUnavailableError` means ask again later; only a genuinely absent
 *     object is absence. A fetch failure that reaches a caller as not-found is
 *     how a sysop ends up deleting catalog rows for files that were fine.
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

export interface FileCacheOptions {
  cacheDir: string;
  volumes: VolumeSet;
  maxBytes: number;
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

let tempCounter = 0;

export class FileCache {
  private readonly cacheDir: string;
  private readonly volumes: VolumeSet;
  private readonly maxBytes: number;

  /** Unfinished uploads, keyed by `${driveNumber}:${key}`. Pinned, journalled. */
  private readonly dirty = new Map<string, PendingEntry>();

  /**
   * Ids THIS process has finished with - uploaded, or found to have no staged
   * file left. Subtracted when the journal is rewritten, so a merge with
   * another node's entries re-adds neither.
   */
  private readonly resolved = new Set<string>();

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

  private shortfallBytes = 0;

  constructor(opts: FileCacheOptions) {
    this.cacheDir = opts.cacheDir;
    this.volumes = opts.volumes;
    this.maxBytes = opts.maxBytes;
    fs.mkdirSync(this.cacheDir, { recursive: true });
    this.loadJournal();
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
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (e): e is PendingEntry =>
          typeof e === 'object' &&
          e !== null &&
          typeof (e as PendingEntry).driveNumber === 'number' &&
          typeof (e as PendingEntry).key === 'string' &&
          typeof (e as PendingEntry).localPath === 'string'
      );
    } catch {
      // A corrupt journal must not stop the board. The staged files are still
      // on disk, and because `evictTo` refuses to delete anything it could not
      // fetch again, they are not at risk while a sysop re-uploads them.
      console.warn(`[storage] cache journal at ${this.journalPath} is unreadable; pending uploads must be re-run by hand`);
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
   * as dirty, and the next `evictTo` after a restart would be free to delete
   * it. So on-disk entries this process has not resolved are carried through
   * every save, and the write is a temp-file rename so a crash mid-save cannot
   * leave a truncated journal.
   */
  private saveJournal(): void {
    const merged = new Map<string, PendingEntry>();
    for (const entry of this.readJournalFromDisk()) {
      const id = this.id(entry.driveNumber, entry.key);
      if (this.resolved.has(id)) continue; // this process uploaded it
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
      // A journal we cannot write is bad, but throwing here would turn a
      // successful upload into a failure and a failed upload into a lost
      // pin. The in-memory map still pins everything for this process.
      console.warn(`[storage] cannot write cache journal ${this.journalPath}: ${String(err)}`);
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
    // ensureLocal serves as a complete one.
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
   * The emulator's form of `ensureLocal`. It blocks with `deasync.loopWhile`
   * exactly the way `BsdSocketLibrary.recv()` does at BsdSocketLibrary.ts:717.
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
   *    returns without draining anything, `loopWhile` falls through to
   *    `uv_run(UV_RUN_ONCE)`, and the process DEADLOCKS - not slowly, not with
   *    a timeout, permanently. Measured, not assumed: the same call settles in
   *    0 ms at top level or from `setImmediate` and never returns from inside
   *    a `.then()`. The emulator's trap handlers satisfy this today; a caller
   *    that wants these bytes from async code must use `ensureLocal` instead.
   */
  ensureLocalSync(driveNumber: number, key: string): string {
    let result: string | undefined;
    let failure: unknown;
    let done = false;

    this.ensureLocal(driveNumber, key).then(
      (value) => {
        result = value;
        done = true;
      },
      (error: unknown) => {
        failure = error;
        done = true;
      }
    );

    deasync.loopWhile(() => !done);
    if (failure !== undefined) throw failure;
    return result as string;
  }

  // ------------------------------------------------------------ write paths

  /**
   * Records that a local file holds bytes the pool does not have yet. From
   * this moment the file is pinned against eviction and will be retried at
   * every boot until it lands.
   */
  markDirty(driveNumber: number, key: string, localPath: string): void {
    this.assertSafeKey(key);
    const id = this.id(driveNumber, key);
    this.dirty.set(id, { driveNumber, key, localPath });
    // It is dirty again, so a previous resolution of this id must stop
    // subtracting it from the journal.
    this.resolved.delete(id);
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
      throw error; // the entry stays dirty and the local copy stays on disk
    }
    this.volumes.markDegraded(driveNumber, false);

    const previous = this.uploadedSizes.get(id) ?? 0;
    state.usedBytes += body.length - previous;
    this.uploadedSizes.set(id, body.length);
    state.requestsThisMonth++;

    this.dirty.delete(id);
    this.resolved.add(id);
    this.saveJournal();
  }

  /**
   * `writeBack` for the emulator thread, blocking the same way
   * `ensureLocalSync` does and carrying BOTH of its restrictions: emulator
   * thread only, and macrotask only. Read that note before calling this.
   *
   * Task 10 calls it from `DosLibrary.Close()`, where a door that has just
   * written a file and reopens it expects to read back what it wrote - which
   * means the upload has to have been attempted before Close() returns.
   */
  writeBackSync(driveNumber: number, key: string, localPath: string): void {
    let failure: unknown;
    let done = false;

    this.writeBack(driveNumber, key, localPath).then(
      () => {
        done = true;
      },
      (error: unknown) => {
        failure = error;
        done = true;
      }
    );

    deasync.loopWhile(() => !done);
    if (failure !== undefined) throw failure;
  }

  /** Retries every unfinished upload. Called at boot. */
  async flushPending(): Promise<void> {
    for (const entry of [...this.dirty.values()]) {
      const id = this.id(entry.driveNumber, entry.key);
      if (!fs.existsSync(entry.localPath)) {
        // Nothing left to upload. Keeping the entry would pin a path that no
        // longer exists and retry it for ever.
        this.dirty.delete(id);
        this.resolved.add(id);
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
   * What it will NOT do: delete a dirty file, or any file that is not laid out
   * as `<cacheDir>/<driveNumber>/<key>`. If everything left is pinned, the
   * cache stays over budget and says so - `overBudgetBytes()` reports the
   * excess and a warning names it. That is the correct outcome: a cache over
   * its budget costs disk, and a cache that deleted the only copy of a file
   * costs the file. An operator seeing a persistent shortfall is being told
   * the pool has stopped accepting writes, which is the thing to fix.
   */
  evictTo(maxBytes: number = this.maxBytes): void {
    const pinnedPaths = new Set([...this.dirty.values()].map((e) => path.resolve(e.localPath)));
    const journal = path.resolve(this.journalPath);

    const files: Array<{ full: string; size: number; used: number; evictable: boolean }> = [];

    const walk = (dir: string): void => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.isFile()) continue;
        const resolved = path.resolve(full);
        if (resolved === journal || resolved.startsWith(`${journal}.tmp-`)) continue; // bookkeeping, not payload

        let size: number;
        let atime: number;
        try {
          const st = fs.statSync(full);
          size = st.size;
          atime = st.atimeMs;
        } catch {
          continue; // vanished under us; nothing to account for
        }

        const id = this.materialisedIdFor(full);
        const evictable = id !== null && !this.dirty.has(id) && !pinnedPaths.has(resolved);
        files.push({ full, size, used: Math.max(atime, this.lastUsed.get(resolved) ?? 0), evictable });
      }
    };
    walk(this.cacheDir);

    let total = files.reduce((sum, f) => sum + f.size, 0);
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
    if (this.shortfallBytes > 0) {
      console.warn(
        `[storage] cache is ${this.shortfallBytes} bytes over its ${maxBytes} byte budget and cannot shrink further: ` +
          `${this.dirty.size} file(s) have not been uploaded yet and will not be deleted`
      );
    }
  }
}
