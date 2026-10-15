/**
 * Inside a snapshot, existence is a MAP LOOKUP, not a syscall.
 *
 * `withStableListings` exists so one pass can trust a directory listing
 * without re-checking it, and it took the screen index from 279,250 stats to
 * a few thousand. But two functions underneath it still opened with a real
 * `fs.existsSync`:
 *
 *   existsSync(p)  -> fs.existsSync(p)                  // syscall
 *                  -> resolvePath(p) -> fs.existsSync(p) // syscall again
 *
 * so an `amigafs.statSync` was never fewer than two syscalls and a miss was
 * three. Counted on this board, one index build made 13,315 filesystem calls -
 * 5,751 stat and 3,451 exists - and took ~2s of SYNCHRONOUS time on the
 * backend's single event loop, which is what the sysop met three times in one
 * evening as "it seems stuck".
 *
 * The listing the snapshot already holds answers the same question: a file is
 * present exactly when its parent's listing names it. These tests pin that the
 * syscall is gone and that the ANSWER did not change.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as amigafs from '../../src/utils/amigafs';

describe('a snapshot does not stat what it has already listed', () => {
  let dir: string;
  let existsCalls: number;
  let realExists: typeof fs.existsSync;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-syscalls-'));
    fs.writeFileSync(path.join(dir, 'BBSTITLE.TXT'), 'art', 'latin1');
    fs.writeFileSync(path.join(dir, 'BULL.TXT'), 'art', 'latin1');
    amigafs.forgetDirectoryListings();

    existsCalls = 0;
    realExists = fs.existsSync;
    (fs as { existsSync: typeof fs.existsSync }).existsSync = ((p: fs.PathLike) => {
      existsCalls += 1;
      return realExists(p);
    }) as typeof fs.existsSync;
  });

  afterEach(() => {
    (fs as { existsSync: typeof fs.existsSync }).existsSync = realExists;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('asks the disk no more than once per directory for many lookups', () => {
    amigafs.withStableListings(() => {
      // The shape the index makes: the same directory probed for many names,
      // most of which are not there.
      for (let i = 0; i < 50; i++) {
        amigafs.existsSync(path.join(dir, `NOTHERE${i}.TXT`));
      }
      amigafs.existsSync(path.join(dir, 'BBSTITLE.TXT'));
    });

    // Before this fix each of the 51 lookups cost at least one fs.existsSync,
    // and the misses cost two. The listing is read once; nothing else needs
    // the disk.
    expect(existsCalls).toBeLessThan(10);
  });

  it('still answers what is there and what is not', () => {
    const seen = amigafs.withStableListings(() => ({
      present: amigafs.existsSync(path.join(dir, 'BBSTITLE.TXT')),
      byOtherCase: amigafs.existsSync(path.join(dir, 'bbstitle.txt')),
      absent: amigafs.existsSync(path.join(dir, 'NOPE.TXT')),
      resolved: amigafs.resolvePath(path.join(dir, 'bull.txt')),
    }));

    expect(seen.present).toBe(true);
    expect(seen.byOtherCase).toBe(true);       // an Amiga volume is case-insensitive
    expect(seen.absent).toBe(false);
    expect(seen.resolved).toBe(path.join(dir, 'BULL.TXT'));
  });

  it('outside a snapshot, nothing changes', () => {
    // The long-lived process still re-checks, which is what makes a file
    // written by a door visible to the next request.
    expect(amigafs.existsSync(path.join(dir, 'BBSTITLE.TXT'))).toBe(true);
    expect(amigafs.existsSync(path.join(dir, 'NOPE.TXT'))).toBe(false);
  });

  it('sees a file written between two snapshots', () => {
    amigafs.withStableListings(() => amigafs.existsSync(path.join(dir, 'BBSTITLE.TXT')));
    fs.writeFileSync(path.join(dir, 'LATE.TXT'), 'new', 'latin1');

    const found = amigafs.withStableListings(() => amigafs.existsSync(path.join(dir, 'LATE.TXT')));

    expect(found).toBe(true);
  });
});
