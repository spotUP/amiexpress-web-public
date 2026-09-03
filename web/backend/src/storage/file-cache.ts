/**
 * Local disk as a cache in front of the pool.
 *
 * THE RULE THE WHOLE DESIGN RESTS ON: the cache may never delete the only copy
 * of anything. A file whose upload has not succeeded is PENDING, is pinned
 * against eviction, and is recorded on disk so a crash mid-upload resumes the
 * upload instead of losing the write.
 *
 * ONE RECORD, AND IT LIVES OUTSIDE THE PAYLOAD NAMESPACE.
 *
 *   <cacheDir>/<drive>/<key>                  the payload: cached or staged
 *   <cacheDir>/.pending/<drive>/<key>.json    the marker: THE pending set
 *   <cacheDir>/.parked/<drive>/<key>          quarantined bytes, awaiting a sysop
 *
 * There used to be two records - a JSON journal at a fixed path and a sidecar
 * marker at `<localPath>.dirty` - and keeping both cost three rounds of bugs.
 * Every policy check had to be written on the journal's path AND on the
 * marker's, and one of them was duly written on one path only; and because a
 * sidecar sat in the payload namespace, an object whose key ended `.dirty` was
 * over-pinned, nearly swept, and JSON-parsed at boot. Both classes of defect
 * are structural, so both are removed structurally:
 *
 *   - THE MARKER IS THE PENDING SET. There is nothing to reconcile it against,
 *     nothing to merge across processes, and no second place a policy check can
 *     be forgotten.
 *   - A MARKER IS NEVER BESIDE ITS PAYLOAD. Boot recovery walks `.pending/`
 *     only, so no payload can be read, parsed, mistaken for a marker or
 *     deleted as one, whatever its key spells.
 *   - THE MARKER'S PATH CARRIES ITS IDENTITY. `.pending/<drive>/<key>.json`
 *     names the object, so a marker too corrupt to parse still pins exactly
 *     the right file.
 *
 * PARKING IS A MOVE, NOT A FLAG. When the staged bytes no longer match the
 * stamp the marker was written for, the payload is renamed into `.parked/` and
 * its marker dropped. It leaves the eviction namespace entirely, so it cannot
 * be silently reclaimed and cannot be un-safed by a sysop deleting a marker; it
 * stops counting against the cache budget; and it is countable -
 * `parkedFiles()` lists it.
 *
 * `evictTo` only ever deletes a file it could FETCH AGAIN - one that lives at
 * the `<cacheDir>/<drive>/<key>` path `localPathFor` produces and has no
 * marker. Anything else under the cache directory is somebody else's file.
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

/**
 * One unfinished upload - the whole record, as the marker holds it.
 *
 * `size` and `mtimeMs` are the staged file as it stood when the marker went
 * down. They exist for one case: nothing is fsynced before rename, so a power
 * loss can leave a staged file PRESENT-BUT-TRUNCATED with its marker intact.
 * Replaying that blindly puts short bytes over a perfectly good object and then
 * removes the marker, so the good bytes are gone with nothing recording it. On
 * disagreement the replay parks the file instead - see `parkedFiles`.
 *
 * They are optional because a marker written before its file existed cannot
 * carry them. That marker cannot vouch for anything, so it parks too; see the
 * ordering rule on `markDirty`.
 */
export interface PendingEntry {
  driveNumber: number;
  key: string;
  localPath: string;
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
 * marker was removed and its bytes charged to the volume. The door is told the
 * write failed when it landed.
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
 * The two namespaces that are NOT payload. Both are skipped by every walk of
 * the cache tree, so a marker can never be evicted and a parked file never
 * counts against the budget or gets reclaimed.
 */
const PENDING_DIR = '.pending';
const PARKED_DIR = '.parked';

/** Marker file names. Only meaningful inside `.pending/`. */
const MARKER_SUFFIX = '.json';

/**
 * A marker is a handful of fields. Anything larger is not one, and must not be
 * handed to `JSON.parse` - a cache directory a sysop has dropped something into
 * should not be able to make the board allocate a gigabyte at boot.
 */
const MAX_MARKER_BYTES = 64 * 1024;

/**
 * Scratch this module writes and must never mistake for anything else: the
 * `.tmp-<pid>-<n>` files a download and a marker write rename from.
 */
const TEMP_SUFFIX_PATTERN = /\.tmp-(\d+)-\d+$/;

let tempCounter = 0;

interface EvictionCandidate {
  full: string;
  size: number;
  used: number;
  evictable: boolean;
}

export class FileCache {
  private readonly cacheDir: string;
  private readonly volumes: VolumeSet;
  private readonly maxBytes: number;
  private readonly syncTimeoutMs: number;

  /** Directories the payload walk must not descend into. */
  private readonly nonPayloadDirs: ReadonlySet<string>;

  /** Unfinished uploads, keyed by `${driveNumber}:${key}`. Pinned, marked. */
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

  private shortfallBytes = 0;
  private warnedShortfall = false;
  /**
   * Re-arming, NOT sticky. The deleted eviction-disable latch was set for the
   * life of the process; this one is per-episode and clears the moment
   * `.pending/` reads cleanly again. The ENOSPC argument for never switching
   * eviction off is about WRITE failures - it does not apply to failing to
   * READ one directory, and a pin record that cannot be listed is precisely
   * the case where deleting nothing is the only safe answer.
   */
  private warnedPinRecordUnreadable = false;

  constructor(opts: FileCacheOptions) {
    this.cacheDir = opts.cacheDir;
    this.volumes = opts.volumes;
    this.maxBytes = opts.maxBytes;
    this.syncTimeoutMs = opts.syncTimeoutMs ?? DEFAULT_SYNC_TIMEOUT_MS;
    this.nonPayloadDirs = new Set([
      path.resolve(this.cacheDir, PENDING_DIR),
      path.resolve(this.cacheDir, PARKED_DIR),
    ]);
    fs.mkdirSync(this.cacheDir, { recursive: true });
    this.recoverFromDisk();
  }

  // ------------------------------------------------------------------- paths

  private get pendingRoot(): string {
    return path.join(this.cacheDir, PENDING_DIR);
  }

  private get parkedRoot(): string {
    return path.join(this.cacheDir, PARKED_DIR);
  }

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
   * staged file inside the `<drive>/<key>` layout where the pin and the
   * re-fetchability rule apply to it.
   */
  localPathFor(driveNumber: number, key: string): string {
    this.assertSafeKey(key);
    return path.join(this.cacheDir, String(driveNumber), key);
  }

  /**
   * The marker for an object. It is NEVER beside the payload: a marker in the
   * payload namespace is a file that some key spells, and a key that spells a
   * marker gets over-pinned at best and parsed or deleted at worst.
   */
  private markerPathFor(driveNumber: number, key: string): string {
    this.assertSafeKey(key);
    return path.join(this.pendingRoot, String(driveNumber), `${key}${MARKER_SUFFIX}`);
  }

  /** Where quarantined bytes go. Out of the eviction namespace by construction. */
  private parkedPathFor(driveNumber: number, key: string): string {
    this.assertSafeKey(key);
    return path.join(this.parkedRoot, String(driveNumber), key);
  }

  /**
   * The id of the object a payload path holds, or null when this is not a file
   * the cache materialised and could therefore fetch again. Null is the answer
   * that keeps a file alive through `evictTo`.
   */
  private materialisedIdFor(full: string): string | null {
    const located = this.splitUnder(this.cacheDir, full);
    return located ? this.id(located.driveNumber, located.key) : null;
  }

  /**
   * Splits `<root>/<drive>/<rest>` into a drive number and a key. Used for both
   * the payload tree and the parked tree, which share that shape on purpose -
   * a parked file keeps its identity, so `parkedFiles()` can name what it is.
   */
  private splitUnder(root: string, full: string): { driveNumber: number; key: string } | null {
    const rel = path.relative(root, full);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
    const parts = rel.split(path.sep);
    if (parts.length < 2) return null;
    if (!DRIVE_DIR_PATTERN.test(parts[0])) return null;
    return { driveNumber: Number(parts[0]), key: parts.slice(1).join('/') };
  }

  /**
   * Who a marker is for, taken from WHERE IT SITS rather than what it says. A
   * marker too corrupt to parse still pins exactly the right object this way,
   * which is the property the old sidecar layout could not have.
   */
  private idFromMarkerPath(full: string): { driveNumber: number; key: string } | null {
    const located = this.splitUnder(this.pendingRoot, full);
    if (!located || !located.key.endsWith(MARKER_SUFFIX)) return null;
    const key = located.key.slice(0, -MARKER_SUFFIX.length);
    if (key === '') return null;
    return { driveNumber: located.driveNumber, key };
  }

  // ----------------------------------------------------------------- markers

  /**
   * Writes the pin. It goes down BEFORE the upload is attempted and comes up
   * only once the bytes are in the pool, so at no instant is a staged file both
   * unrecorded and un-uploaded. Temp-then-rename, so a crash mid-write cannot
   * leave a half-marker that would park a perfectly good upload.
   */
  private writeMarker(entry: PendingEntry): void {
    const markerPath = this.markerPathFor(entry.driveNumber, entry.key);
    const tmp = `${markerPath}.tmp-${process.pid}-${tempCounter++}`;
    try {
      fs.mkdirSync(path.dirname(markerPath), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(entry));
      fs.renameSync(tmp, markerPath);
    } catch (err) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // nothing to clean up
      }
      // Warn, but do NOT stop evicting. This process's own record is intact -
      // `dirty` holds the entry and pins the file for as long as the process
      // lives - so nothing here is unsafe to delete. Refusing to evict would
      // deadlock the board in exactly the case eviction is the remedy for:
      // under ENOSPC this write fails, eviction switches off, and the disk
      // never recovers. What is lost is the pin's ability to outlive a
      // restart, which is a degraded guarantee, not an unsafe one.
      console.warn(
        `[storage] cannot write pending marker ${markerPath}: ${String(err)}; ` +
          `this upload is pinned in memory only and will not survive a restart`
      );
    }
  }

  /** Size and mtime of the staged file, or nothing if it cannot be stat'd. */
  private stampOf(localPath: string): { size?: number; mtimeMs?: number } {
    try {
      const st = fs.statSync(localPath);
      return { size: st.size, mtimeMs: st.mtimeMs };
    } catch {
      return {};
    }
  }

  /**
   * Whether the staged file is still what the marker was written for. An entry
   * with no stamp - written before its file existed, or recovered from a marker
   * that could not be read - cannot vouch for anything and answers no.
   */
  private stampStillMatches(entry: PendingEntry): boolean {
    if (entry.size === undefined || entry.mtimeMs === undefined) return false;
    try {
      const st = fs.statSync(entry.localPath);
      return st.size === entry.size && st.mtimeMs === entry.mtimeMs;
    } catch {
      return false;
    }
  }

  private removeMarker(driveNumber: number, key: string): void {
    try {
      fs.unlinkSync(this.markerPathFor(driveNumber, key));
    } catch {
      // Already gone, which is the desired end state.
    }
  }

  private readMarker(markerPath: string): PendingEntry | null {
    try {
      const st = fs.statSync(markerPath);
      if (st.size > MAX_MARKER_BYTES) {
        console.warn(
          `[storage] pending marker ${markerPath} is ${st.size} bytes, far larger than a marker can be; ` +
            `it will not be parsed and its object is treated as unvouched-for`
        );
        return null;
      }
      const parsed: unknown = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
      return isPendingEntry(parsed) ? parsed : null;
    } catch {
      console.warn(`[storage] pending marker ${markerPath} is unreadable; its object is treated as unvouched-for`);
      return null;
    }
  }

  // ---------------------------------------------------------------- recovery

  /**
   * ONE BOUNDED WALK OF `.pending/`, and nothing else.
   *
   * Every marker on disk is a pending upload, so the walk simply reads them
   * back into `dirty`. Because a marker's identity comes from its path, a
   * marker that cannot be parsed still lands as a pending entry with no
   * stamp - pinned, and unvouched-for, which is exactly what it is.
   *
   * A marker whose file is gone is removed: `evictTo` never deletes a marked
   * object, so leaving one would make the next cold fetch of that key
   * permanently un-evictable. Nothing else ever removes one - and, unlike the
   * old sidecar layout, there is no way for this unlink to reach a payload,
   * because payloads do not live here.
   */
  private recoverFromDisk(): void {
    const recovered: string[] = [];

    this.walkFiles(this.pendingRoot, (full, name) => {
      const temp = TEMP_SUFFIX_PATTERN.exec(name);
      if (temp) {
        this.sweepIfOrphaned(full, Number(temp[1]));
        return;
      }

      const located = this.idFromMarkerPath(full);
      if (!located) {
        console.warn(`[storage] ${full} is not a marker name; leaving it alone`);
        return;
      }

      const marker = this.readMarker(full);
      const localPath = this.stagingPathUnderCache(marker?.localPath, located.driveNumber, located.key);

      if (!fs.existsSync(localPath)) {
        if (!marker) {
          // The marker did not parse, so `localPath` above is a GUESS - the
          // canonical path - and the real staged file may be somewhere else
          // entirely and perfectly intact. Unlinking here would say "the file
          // it protected is gone" when what is actually gone is the retry.
          // Leave it: an over-pinned canonical path costs disk, a forgotten
          // pending upload costs the write.
          console.warn(
            `[storage] pending marker ${full} could not be read and nothing is staged at ${localPath}; ` +
              `leaving the marker in place - its upload cannot be replayed and a sysop should look`
          );
          return;
        }
        try {
          fs.unlinkSync(full);
        } catch {
          // Someone else got there first.
        }
        console.warn(`[storage] removed pending marker ${full}: the staged file it protected is gone`);
        return;
      }

      const id = this.id(located.driveNumber, located.key);
      this.dirty.set(id, {
        driveNumber: located.driveNumber,
        key: located.key,
        localPath,
        size: marker?.size,
        mtimeMs: marker?.mtimeMs,
      });
      recovered.push(id);
    }, (dir, err) => {
      console.warn(
        `[storage] cannot read the pending record at ${dir}: ${String(err)}; ` +
          `unfinished uploads recorded there will not be replayed and eviction will refuse to run`
      );
    });

    if (recovered.length > 0) {
      console.warn(`[storage] recovered ${recovered.length} pending upload(s) from disk: ${recovered.join(', ')}`);
    }
  }

  private sweepIfOrphaned(full: string, pid: number): void {
    if (isProcessAlive(pid)) return;
    try {
      fs.unlinkSync(full);
    } catch {
      // Someone else got there first.
    }
  }

  /**
   * `onError` is called for a directory that exists but CANNOT BE READ, and
   * never for one that is merely absent.
   *
   * The distinction is load-bearing for the pin record. Swallowing every
   * readdir failure alike makes "there are no markers" and "the markers cannot
   * be listed" the same answer, and the second answer must never let `evictTo`
   * conclude that a staged, un-uploaded payload is a clean cached copy. ENOENT
   * is the ordinary empty case - a cache that has never had a pending upload
   * has no `.pending/` at all. EACCES, ENOTDIR, EIO and friends are not.
   */
  private walkFiles(
    dir: string,
    visit: (full: string, name: string) => void,
    onError?: (dir: string, err: NodeJS.ErrnoException) => void
  ): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      const errno = err as NodeJS.ErrnoException;
      if (errno.code !== 'ENOENT' && onError) onError(dir, errno);
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (this.nonPayloadDirs.has(path.resolve(full))) continue;
        this.walkFiles(full, visit, onError);
      } else if (entry.isFile()) {
        visit(full, entry.name);
      }
    }
  }

  // ------------------------------------------------------------------ parked

  /**
   * Quarantines a staged file whose bytes nobody can vouch for: renames it into
   * `.parked/<drive>/<key>` and drops its marker and its pending entry.
   *
   * A MOVE, not a flag. Parked bytes leave the eviction namespace, so no future
   * walk can reclaim them and no sysop deleting a marker can un-safe them; they
   * stop counting against the cache budget; and `parkedFiles()` can enumerate
   * them. The file is still on disk and still complete - the decision about it
   * is deferred to a person, not taken by guessing.
   */
  private park(entry: PendingEntry, why: string): void {
    const id = this.id(entry.driveNumber, entry.key);
    const base = this.parkedPathFor(entry.driveNumber, entry.key);
    let destination = base;
    try {
      fs.mkdirSync(path.dirname(base), { recursive: true });
      destination = this.linkIntoParked(entry.localPath, base);
      fs.unlinkSync(entry.localPath);
      this.dirty.delete(id);
      this.removeMarker(entry.driveNumber, entry.key);
      console.warn(
        `[storage] parked ${id}: ${why}. The bytes are kept at ${destination} and will NOT be uploaded; ` +
          `a sysop must decide. parkedFiles() lists them.`
      );
    } catch (err) {
      // The move failed - a cross-device staging path, or a permission
      // problem. Fall back to the weaker form of the same decision: drop the
      // pending entry so nothing replays it, and LEAVE the marker, which keeps
      // the file pinned where it lies.
      this.dirty.delete(id);
      console.warn(
        `[storage] could not park ${id} at ${destination}: ${String(err)}. ${entry.localPath} will NOT be ` +
          `uploaded and stays pinned where it is, pending a sysop.`
      );
    }
  }

  /**
   * Hard-links a staged file into `.parked/` under a name nothing else holds,
   * and answers where it landed.
   *
   * `rename` would be the obvious call and is WRONG here: POSIX rename replaces
   * an existing regular file silently, so a second crash-truncation episode on
   * one key would park over the first park - destroying bytes that by
   * construction exist nowhere else and whose whole purpose is to wait for a
   * person. `link` fails with EEXIST instead of overwriting, so the collision
   * is detected rather than papered over, and it is atomic, so two nodes
   * parking at once cannot both win the same name. The source is unlinked only
   * after the link succeeds; a crash in between leaves both names for one
   * inode, which is the safe direction.
   */
  private linkIntoParked(localPath: string, base: string): string {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const candidate = attempt === 0 ? base : `${base}.${attempt + 1}`;
      try {
        fs.linkSync(localPath, candidate);
        return candidate;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      }
    }
    throw new Error(`no free parked name for ${base} after 1000 attempts`);
  }

  /**
   * A staging path this cache is willing to act on, or the canonical one.
   *
   * A recovered marker's `localPath` drives three dangerous things: `writeBack`
   * uploads whatever is there to the pool, `ensureLocal` hands it to a door as
   * this object's bytes, and `park` renames it into `.parked/`. A marker is a
   * file in a directory a sysop can write to, so its `localPath` is input, not
   * fact. Anything that does not resolve under the cache directory is refused
   * and the canonical path used instead - which every legitimate staging path,
   * here and in Task 10, already is.
   */
  private stagingPathUnderCache(candidate: string | undefined, driveNumber: number, key: string): string {
    const canonical = this.localPathFor(driveNumber, key);
    if (candidate === undefined) return canonical;
    const resolved = path.resolve(candidate);
    const rel = path.relative(path.resolve(this.cacheDir), resolved);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      console.warn(
        `[storage] marker for ${this.id(driveNumber, key)} names ${candidate}, which is outside the cache ` +
          `directory; ignoring it and using ${canonical}`
      );
      return canonical;
    }
    return resolved;
  }

  /**
   * Every file quarantined by a failed vouch, with the object it was staged
   * for. This is the operator surface for parking: a parked file is safe but
   * unresolved, and only a person can say whether its bytes should go to the
   * pool or be thrown away.
   */
  parkedFiles(): CachedFile[] {
    const found: CachedFile[] = [];
    this.walkFiles(this.parkedRoot, (full) => {
      const located = this.splitUnder(this.parkedRoot, full);
      if (!located) return;
      found.push({ localPath: full, driveNumber: located.driveNumber, key: located.key });
    });
    return found;
  }

  // ------------------------------------------------------------------ status

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
   *   1. A PENDING entry wins. Its staged file is newer than anything the pool
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
   * A PARKED file is deliberately not in that list. Parking says nobody can
   * vouch for those bytes, so the pool's object becomes the served version
   * again - which is also why parking moves the file out of `<drive>/<key>`
   * rather than leaving it there to be served.
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
    // pid so the eviction walk skips it and a later sweep can tell an orphan
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
   * already marked, so raising loses nothing.
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
   * Records that a local file holds bytes the pool does not have yet. From this
   * moment the file is pinned against eviction and will be retried at every
   * boot until it lands.
   *
   * THE ORDERING RULE: WRITE THE BYTES FIRST, THEN CALL THIS. The marker stamps
   * the file's size and mtime as it stands right now, and that stamp is what
   * lets a later boot vouch for the bytes it finds. Pinning at open time -
   * markDirty, then write - produces a marker with no stamp, which can vouch
   * for nothing and PARKS the file instead of uploading it. A door that has
   * finished writing and is closing is the shape this expects, which is why
   * Task 10 calls `writeBackSync` from `Close()`.
   */
  markDirty(driveNumber: number, key: string, localPath: string): void {
    this.assertSafeKey(key);
    const stamp = this.stampOf(localPath);
    if (stamp.size === undefined) {
      console.warn(
        `[storage] ${localPath} does not exist yet at markDirty for ${this.id(driveNumber, key)}; ` +
          `the marker cannot vouch for it and a later boot will park it. Write the bytes before marking them.`
      );
    }
    const entry: PendingEntry = { driveNumber, key, localPath, ...stamp };
    // Marker first. It is the record, so it must exist before the upload is
    // attempted; a crash between the two resumes.
    this.writeMarker(entry);
    this.dirty.set(this.id(driveNumber, key), entry);
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
      throw error; // the entry stays pending, marked, and on disk
    }
    this.volumes.markDegraded(driveNumber, false);

    const previous = this.uploadedSizes.get(id) ?? 0;
    state.usedBytes += body.length - previous;
    this.uploadedSizes.set(id, body.length);
    state.requestsThisMonth++;

    // The bytes are in the pool now, so unpinning is safe.
    this.dirty.delete(id);
    this.removeMarker(driveNumber, key);
  }

  /**
   * `writeBack` for the emulator thread, blocking the same way
   * `ensureLocalSync` does and carrying BOTH of its restrictions: emulator
   * thread only, and macrotask only. Read that note before calling this.
   *
   * Task 10 calls it from `DosLibrary.Close()`, where a door that has just
   * written a file and reopens it expects to read back what it wrote - which
   * means the upload has to have been attempted before Close() returns. On
   * timeout it raises rather than hanging; the entry is already marked, so the
   * bytes are safe and the next boot finishes the job.
   */
  writeBackSync(driveNumber: number, key: string, localPath: string): void {
    this.blockOn(driveNumber, `uploading ${key}`, this.writeBack(driveNumber, key, localPath));
  }

  /**
   * Retries every unfinished upload. Called at boot.
   *
   * This is the ONE place a pending entry can become an upload, so it is the
   * one place the stamp is checked - the check cannot be written on one replay
   * path and forgotten on another, because there is only one. An entry whose
   * file no longer matches the stamp its marker carries is PARKED rather than
   * uploaded: size and mtime cannot tell a power-loss truncation from a
   * legitimate rewrite, and guessing wrong destroys a good object in the pool
   * with no way back, whereas parking keeps both copies and asks a person.
   */
  async flushPending(): Promise<void> {
    for (const entry of [...this.dirty.values()]) {
      const id = this.id(entry.driveNumber, entry.key);
      if (!fs.existsSync(entry.localPath)) {
        // Nothing left to upload. Keeping the entry would pin a path that no
        // longer exists and retry it for ever.
        this.dirty.delete(id);
        this.removeMarker(entry.driveNumber, entry.key);
        console.warn(`[storage] pending upload ${id} has no staged file at ${entry.localPath}; dropping it`);
        continue;
      }
      if (!this.stampStillMatches(entry)) {
        this.park(entry, 'the staged file does not match the marker written for it');
        continue;
      }
      try {
        await this.writeBack(entry.driveNumber, entry.key, entry.localPath);
      } catch {
        // Still unavailable. It stays pending and pinned; the next boot tries
        // again.
      }
    }
  }

  // --------------------------------------------------------------- eviction

  /**
   * Brings the cache down to `maxBytes` by deleting files it could fetch
   * again, least recently used first.
   *
   * What it will NOT do: delete a file with a marker; delete a pending file;
   * or delete anything that is not laid out as `<cacheDir>/<drive>/<key>`.
   * Markers and parked files are not in the payload namespace at all, so
   * neither is reachable from here. If everything left is pinned, the cache
   * stays over budget and says so - `overBudgetBytes()` reports the excess and
   * a warning names it. That is the correct outcome: a cache over its budget
   * costs disk, and a cache that deleted the only copy of a file costs the
   * file. An operator seeing a persistent shortfall is being told the pool has
   * stopped accepting writes, which is the thing to fix.
   *
   * It also sweeps `.tmp-<pid>-<n>` download scratch left by a process that is
   * gone. That sweep lives here because this is the walk that already visits
   * every payload path; only temps whose pid is no longer running are removed,
   * so a second node's in-flight download is never pulled out from under its
   * own rename.
   */
  evictTo(maxBytes: number = this.maxBytes): void {
    const { files, pinKnown } = this.scanForEviction();
    let total = files.reduce((sum, f) => sum + f.size, 0);

    if (!pinKnown) {
      // The payload tree scanned fine, so the number an admin plots stays live
      // exactly when it matters; what is unknown is which of these files are
      // staged and un-uploaded. Deleting on a guess here breaks the one rule.
      this.shortfallBytes = Math.max(0, total - maxBytes);
      if (!this.warnedPinRecordUnreadable) {
        this.warnedPinRecordUnreadable = true;
        console.warn(
          `[storage] the pending record under ${this.pendingRoot} cannot be listed, so no file can be proven ` +
            `safe to delete; evicting nothing until it reads again`
        );
      }
      return;
    }
    this.warnedPinRecordUnreadable = false;

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

  private scanForEviction(): { files: EvictionCandidate[]; pinKnown: boolean } {
    // The pending set as it stands ON DISK, not merely as this process knows
    // it: another node staging a file into the shared cache directory pins it
    // here too. One bounded walk of `.pending/` answers the pin test for every
    // payload, with no per-file existsSync and no sibling reasoning.
    const onDisk = this.pendingIdsOnDisk();
    const pinnedIds = onDisk ?? new Set<string>();
    for (const id of this.dirty.keys()) pinnedIds.add(id);
    // Staged files that are NOT at `<drive>/<key>` have no id, so they are
    // already un-evictable; this covers them by path as well, cheaply.
    const pinnedPaths = new Set([...this.dirty.values()].map((e) => path.resolve(e.localPath)));

    const files: EvictionCandidate[] = [];

    this.walkFiles(this.cacheDir, (full, name) => {
      const temp = TEMP_SUFFIX_PATTERN.exec(name);
      if (temp) {
        // Scratch, not payload. A live download's temp must survive the walk
        // or a concurrent eviction unlinks it out from under its own rename.
        this.sweepIfOrphaned(full, Number(temp[1]));
        return;
      }

      const resolved = path.resolve(full);
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
      const evictable = id !== null && !pinnedIds.has(id) && !pinnedPaths.has(resolved);
      files.push({ full, size, used: Math.max(atime, this.lastUsed.get(resolved) ?? 0), evictable });
    });

    return { files, pinKnown: onDisk !== null };
  }

  /**
   * Every object with a marker on disk, by id taken from the marker's path -
   * or NULL when the record could not be read.
   *
   * Null is not "nothing is pinned". An absent `.pending/` is an empty set: a
   * cache that has never had a pending upload has no such directory. A
   * `.pending/` that exists and cannot be listed is unknown, and the two must
   * not collapse into the same answer, because the second one silently turns
   * every staged, un-uploaded payload from a previous boot or another node
   * into a clean, re-fetchable copy.
   */
  private pendingIdsOnDisk(): Set<string> | null {
    const ids = new Set<string>();
    let readable = true;
    this.walkFiles(
      this.pendingRoot,
      (full, name) => {
        if (TEMP_SUFFIX_PATTERN.test(name)) return;
        const located = this.idFromMarkerPath(full);
        if (located) ids.add(this.id(located.driveNumber, located.key));
      },
      () => {
        readable = false;
      }
    );
    return readable ? ids : null;
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
 * ESRCH means gone. Used so a sweep never removes another live node's
 * in-flight download temp.
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
