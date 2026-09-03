import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as util from 'util';
import type { ObjectHead, StorageBackend } from './storage-backend';
import { StorageUnavailableError } from './storage-backend';

// `instanceof Error` is not reliable here: fs's native errors and this
// module's own code can be evaluated in different VM realms under the test
// runner, and an error built by one realm's Error constructor fails
// `instanceof` against another realm's. `util.types.isNativeError` checks
// the object's actual internal type instead of its constructor identity, so
// it is realm-safe where `instanceof` is not.
function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return util.types.isNativeError(err) && 'code' in err;
}

function errorMessage(err: unknown): string {
  return util.types.isNativeError(err) ? err.message : String(err);
}

/**
 * ENOENT ("no such file") and ENOTDIR ("a path segment is a file, not a
 * directory") both mean the same thing to a storage caller: this key does
 * not exist. On S3, asking for `Files/DEMO.LHA/x` when `Files/DEMO.LHA` is
 * an object simply returns "not found" - there is no directory layer to
 * collide with. Every other errno (EACCES, EIO, ...) means the volume could
 * not honestly answer, which is a different thing from "not there."
 */
function isMissing(err: unknown): boolean {
  return isErrnoException(err) && (err.code === 'ENOENT' || err.code === 'ENOTDIR');
}

// Matches the full shape tempName() produces below - a leading dot, the
// original basename, then `.tmp-<pid>-<hex>` - not merely the trailing
// suffix. Matching on suffix alone (no required leading dot) would also
// catch a caller-uploaded object whose key legitimately ends the same way,
// e.g. `REPORT.tmp-20240101-abc123` with no leading dot: that object would
// still be fetchable and deletable by exact key, but would silently vanish
// from every list() result - an object the catalog reconciler eventually
// calls an orphan. Used to keep an orphaned temp - left behind by a crash
// between writeFile and rename - out of list() results: it is scratch
// space, never a real object.
const TEMP_SUFFIX_PATTERN = /^\..+\.tmp-\d+-[0-9a-f]+$/;

function tempName(basename: string): string {
  return `.${basename}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
}

/** A drive that is just a directory - what every board has today. */
export class LocalBackend implements StorageBackend {
  constructor(public readonly driveNumber: number, private readonly root: string) {}

  /**
   * Refuses a relative path that would escape the drive root, or that isn't
   * shaped like a path at all: absolute, a `..` segment, or empty/`.` (which
   * resolve to the root itself).
   *
   * Shared by every accessor that reads a directory path, key resolution
   * included, so there is exactly one place that makes the call.
   */
  private assertContained(relPath: string): void {
    if (path.isAbsolute(relPath)) {
      throw new Error(`storage key must be relative to the drive root, got an absolute path: ${relPath}`);
    }
    if (relPath.split(/[\\/]+/).includes('..')) {
      throw new Error(`storage key may not contain ".." segments: ${relPath}`);
    }
  }

  /**
   * Resolves a storage key - an object, not a directory - to a path inside
   * the drive root.
   *
   * Beyond the absolute/`..` checks every path goes through, an object key
   * of `''` or `'.'` resolves to the drive root itself: `put('')` would
   * derive its temp name from the root's own parent directory and write a
   * byte outside the drive before the rename failed. There is no legitimate
   * object at the root, so both are refused here.
   */
  private full(key: string): string {
    this.assertContained(key);
    if (key === '' || key === '.') {
      throw new Error('storage key must not be empty - an empty key resolves to the drive root itself');
    }
    return path.join(this.root, key);
  }

  /**
   * Resolves a directory to read - used only by list(), where the target
   * legitimately can be the drive root (dirPart derived from a bare,
   * slash-free prefix collapses to '.'). Still refuses `..` and absolute
   * paths, the same as full().
   */
  private resolveDir(dirPart: string): string {
    this.assertContained(dirPart);
    return path.join(this.root, dirPart === '.' ? '' : dirPart);
  }

  async head(key: string): Promise<ObjectHead | null> {
    const full = this.full(key);
    try {
      const st = await fs.promises.stat(full);
      return { key, size: st.size, mtime: st.mtime };
    } catch (err) {
      if (isMissing(err)) return null;
      throw new StorageUnavailableError(this.driveNumber, `cannot stat ${key}: ${errorMessage(err)}`);
    }
  }

  async get(key: string): Promise<Buffer> {
    const full = this.full(key);
    try {
      return await fs.promises.readFile(full);
    } catch (err) {
      // Missing is "no such object", a real answer a caller may act on -
      // not "ask again later". Anything else (EACCES, EIO...) means the
      // volume could not honestly answer, and must not be mistaken for one.
      if (isMissing(err)) throw err;
      throw new StorageUnavailableError(this.driveNumber, `cannot read ${key}: ${errorMessage(err)}`);
    }
  }

  /**
   * Writes to a sibling temp file and renames into place, so a crash or a
   * full disk mid-write never leaves a short file where the pool believes a
   * complete copy exists - under one-copy-per-file, that short file would be
   * the only copy. The temp file's name always carries the TEMP_SUFFIX_PATTERN
   * suffix so an orphaned one is recognisable and excluded by list() below.
   */
  async put(key: string, body: Buffer): Promise<void> {
    const full = this.full(key);
    const tmp = path.join(path.dirname(full), tempName(path.basename(full)));
    try {
      await fs.promises.mkdir(path.dirname(full), { recursive: true });
      await fs.promises.writeFile(tmp, body);
      await fs.promises.rename(tmp, full);
    } catch (err) {
      await fs.promises.unlink(tmp).catch(() => undefined);
      throw new StorageUnavailableError(this.driveNumber, `cannot write ${key}: ${errorMessage(err)}`);
    }
  }

  async delete(key: string): Promise<void> {
    const full = this.full(key);
    try {
      await fs.promises.unlink(full);
    } catch (err) {
      // Deleting an object that is already gone is not an error - it is the
      // caller's desired end state.
      if (isMissing(err)) return;
      throw new StorageUnavailableError(this.driveNumber, `cannot delete ${key}: ${errorMessage(err)}`);
    }
  }

  private async walk(dir: string, out: ObjectHead[]): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (isMissing(err)) return;
      throw new StorageUnavailableError(this.driveNumber, `cannot list ${dir}: ${errorMessage(err)}`);
    }
    for (const entry of entries) {
      if (entry.isFile() && TEMP_SUFFIX_PATTERN.test(entry.name)) continue; // scratch space, never a real object
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walk(entryPath, out);
      } else if (entry.isFile()) {
        const key = path.relative(this.root, entryPath).split(path.sep).join('/');
        const st = await fs.promises.stat(entryPath);
        out.push({ key, size: st.size, mtime: st.mtime });
      }
    }
  }

  /**
   * Recursively lists every object whose key starts with `prefix`, matching
   * S3's ListObjectsV2-with-no-delimiter semantics - the shape the fake
   * models and the shape callers get from a real bucket. Walking starts at
   * the directory the prefix names ('Files/', 'Conf1/Files/' both name a
   * directory once the trailing slash is stripped) and descends into every
   * subdirectory below it, not just the immediate entries.
   *
   * A prefix with no trailing slash is still supported as a filename-prefix
   * match within its parent directory. A prefix that names no directory
   * returns an empty array rather than throwing. A prefix of `''` or `'.'`
   * is refused for the same reason an object key of `''` or `'.'` is - it
   * names the drive root, not a real location.
   */
  async list(prefix: string): Promise<ObjectHead[]> {
    if (prefix === '' || prefix === '.') {
      throw new Error(`storage prefix must not be empty - an empty prefix resolves to the drive root itself: ${JSON.stringify(prefix)}`);
    }
    const dirPart = prefix.endsWith('/') ? prefix.slice(0, -1) : path.dirname(prefix);
    const dir = this.resolveDir(dirPart);
    const out: ObjectHead[] = [];
    await this.walk(dir, out);
    return out.filter((o) => o.key.startsWith(prefix));
  }
}
