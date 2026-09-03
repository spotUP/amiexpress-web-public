/**
 * The board is case-insensitive and S3 is not.
 *
 * amigafs.resolvePath answers "the caller typed file.lha, the disk says
 * FILE.LHA" by listing the directory. A bucket cannot be listed per lookup -
 * Oracle's free tier allows 50,000 requests a MONTH, which one busy evening
 * of listings would spend - so each remote area keeps this index instead:
 * one listing, then maintained on every write.
 *
 * Unavailability during refresh() must never look like an empty area: a
 * caller that reads a StorageUnavailableError as "no such file" deletes the
 * catalog row for a file that is fine. refresh() only commits a new listing
 * once backend.list() has actually succeeded - on failure the index keeps
 * whatever it held before (unprimed and empty if this was the first attempt,
 * or the last good listing if not), and the error propagates instead of
 * being swallowed into "not found."
 *
 * note() and forget() are called after a put/delete. Called before the
 * index has ever been primed, they still record into the map, but priming
 * itself stays false - so the next resolve() still performs a real
 * refresh() against the backend (which, since note/forget follow a real
 * write, already reflects the change) rather than trusting a note taken
 * before the index has ever seen ground truth. That real refresh is
 * authoritative and overwrites whatever note()/forget() wrote in the
 * meantime, so a pre-priming call can be redundant but never wrong.
 *
 * Two objects whose names differ only by case can both exist in one bucket
 * (`FILE.LHA` and `file.lha`); the index can keep only one. The winner is
 * the ordinally (byte-value) greatest key, decided by sorting list()'s
 * result before building the map - not by whichever entry the backend
 * happens to return last, which is not guaranteed to be stable.
 */
import * as path from 'path';
import type { ObjectHead, StorageBackend } from './storage-backend';

function byKeyAscending(a: ObjectHead, b: ObjectHead): number {
  if (a.key < b.key) return -1;
  if (a.key > b.key) return 1;
  return 0;
}

export class NameIndex {
  private byLowerName = new Map<string, string>();
  private primed = false;

  constructor(private readonly backend: StorageBackend, private readonly prefix: string) {}

  async refresh(): Promise<void> {
    const heads = await this.backend.list(this.prefix);

    // Built off to the side: this.byLowerName is only replaced once list()
    // has succeeded, so a throw above leaves the index exactly as it was.
    const next = new Map<string, string>();
    for (const head of [...heads].sort(byKeyAscending)) {
      // Ascending order means the ordinally greatest key for a given
      // lowercased name is written last, so it wins - deterministically,
      // regardless of the order the backend returned entries in.
      next.set(path.basename(head.key).toLowerCase(), head.key);
    }
    this.byLowerName = next;
    this.primed = true;
  }

  async resolve(name: string): Promise<string | null> {
    if (!this.primed) await this.refresh();
    return this.byLowerName.get(path.basename(name).toLowerCase()) ?? null;
  }

  note(key: string): void {
    this.byLowerName.set(path.basename(key).toLowerCase(), key);
  }

  forget(key: string): void {
    this.byLowerName.delete(path.basename(key).toLowerCase());
  }
}
