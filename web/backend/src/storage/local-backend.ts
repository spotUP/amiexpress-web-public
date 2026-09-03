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

/** A drive that is just a directory - what every board has today. */
export class LocalBackend implements StorageBackend {
  constructor(public readonly driveNumber: number, private readonly root: string) {}

  /**
   * Resolves a storage key to a path inside the drive root, and refuses one
   * that would escape it.
   *
   * A key with a `..` segment or an absolute path lets get/put/delete/list
   * reach outside the drive root - onto another drive, or anywhere on disk
   * the process can touch. Under one-copy-per-file, an unbounded delete is
   * not a bug to tolerate: it can destroy the only copy of a file that isn't
   * even on this volume. Every accessor routes through this, list's
   * directory resolution included, so there is exactly one place that makes
   * the call.
   */
  private full(key: string): string {
    if (path.isAbsolute(key)) {
      throw new Error(`storage key must be relative to the drive root, got an absolute path: ${key}`);
    }
    if (key.split(/[\\/]+/).includes('..')) {
      throw new Error(`storage key may not contain ".." segments: ${key}`);
    }
    return path.join(this.root, key);
  }

  async head(key: string): Promise<ObjectHead | null> {
    const full = this.full(key);
    try {
      const st = await fs.promises.stat(full);
      return { key, size: st.size, mtime: st.mtime };
    } catch (err) {
      if (isErrnoException(err) && err.code === 'ENOENT') return null;
      throw new StorageUnavailableError(this.driveNumber, `cannot stat ${key}: ${errorMessage(err)}`);
    }
  }

  async get(key: string): Promise<Buffer> {
    const full = this.full(key);
    try {
      return await fs.promises.readFile(full);
    } catch (err) {
      // ENOENT is "no such object", a real answer a caller may act on - not
      // "ask again later". Anything else (EACCES, EIO, ENOTDIR...) means the
      // volume could not honestly answer, and must not be mistaken for one.
      if (isErrnoException(err) && err.code === 'ENOENT') throw err;
      throw new StorageUnavailableError(this.driveNumber, `cannot read ${key}: ${errorMessage(err)}`);
    }
  }

  /**
   * Writes to a sibling temp file and renames into place, so a crash or a
   * full disk mid-write never leaves a short file where the pool believes a
   * complete copy exists - under one-copy-per-file, that short file would be
   * the only copy.
   */
  async put(key: string, body: Buffer): Promise<void> {
    const full = this.full(key);
    const tmp = path.join(
      path.dirname(full),
      `.${path.basename(full)}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`
    );
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
      if (isErrnoException(err) && err.code === 'ENOENT') return;
      throw new StorageUnavailableError(this.driveNumber, `cannot delete ${key}: ${errorMessage(err)}`);
    }
  }

  private async walk(dir: string, out: ObjectHead[]): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (isErrnoException(err) && err.code === 'ENOENT') return;
      throw new StorageUnavailableError(this.driveNumber, `cannot list ${dir}: ${errorMessage(err)}`);
    }
    for (const entry of entries) {
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
   * returns an empty array rather than throwing.
   */
  async list(prefix: string): Promise<ObjectHead[]> {
    const dirPart = prefix.endsWith('/') ? prefix.slice(0, -1) : path.dirname(prefix);
    const dir = this.full(dirPart === '.' ? '' : dirPart);
    const out: ObjectHead[] = [];
    await this.walk(dir, out);
    return out.filter((o) => o.key.startsWith(prefix));
  }
}
