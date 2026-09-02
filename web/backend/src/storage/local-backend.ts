import * as fs from 'fs';
import * as path from 'path';
import type { ObjectHead, StorageBackend } from './storage-backend';

/** A drive that is just a directory - what every board has today. */
export class LocalBackend implements StorageBackend {
  constructor(public readonly driveNumber: number, private readonly root: string) {}

  private full(key: string): string {
    return path.join(this.root, key);
  }

  async head(key: string): Promise<ObjectHead | null> {
    const full = this.full(key);
    if (!fs.existsSync(full)) return null;
    const st = fs.statSync(full);
    return { key, size: st.size, mtime: st.mtime };
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFileSync(this.full(key));
  }

  async put(key: string, body: Buffer): Promise<void> {
    const full = this.full(key);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }

  async delete(key: string): Promise<void> {
    const full = this.full(key);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }

  /**
   * Lists the direct entries of the directory the prefix names, filtered back
   * down to keys that actually start with it.
   *
   * The prefixes this board hands in are directory-shaped and end in a slash
   * - 'Files/', 'Conf1/Files/' - naming the directory to read, not a partial
   * filename. Stripping that trailing slash gives the directory directly;
   * running it through path.dirname() the way a file path would be handled
   * strips one component too many ('Conf1/Files/' -> 'Conf1', not
   * 'Conf1/Files') and lists the wrong directory. A prefix with no trailing
   * slash is still supported as a filename-prefix match within its parent
   * directory. This is a single directory read, not a recursive walk - the
   * board never asks for a prefix that spans more than one directory level.
   */
  async list(prefix: string): Promise<ObjectHead[]> {
    const dirPart = prefix.endsWith('/') ? prefix.slice(0, -1) : path.dirname(prefix);
    const dir = path.join(this.root, dirPart);
    if (!fs.existsSync(dir)) return [];

    const out: ObjectHead[] = [];
    for (const name of fs.readdirSync(dir)) {
      const key = dirPart === '' || dirPart === '.' ? name : `${dirPart}/${name}`;
      if (!key.startsWith(prefix)) continue;
      const st = fs.statSync(path.join(dir, name));
      if (st.isFile()) out.push({ key, size: st.size, mtime: st.mtime });
    }
    return out;
  }
}
