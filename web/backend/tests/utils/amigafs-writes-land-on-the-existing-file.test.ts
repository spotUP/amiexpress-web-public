/**
 * A WRITE LANDS ON THE FILE THAT IS ALREADY THERE.
 *
 * An Amiga volume cannot hold two files whose names differ only in case, so a
 * door that writes `hiscores` into a drawer holding `HISCORES` must land on
 * `HISCORES`. amigafs got this right for openSync and appendFileSync and
 * wrong for writeFileSync, mkdirSync, and the DESTINATION side of renameSync,
 * copyFileSync, linkSync and symlinkSync: those resolved the parent directory
 * case-insensitively and then joined `path.basename()` VERBATIM, so the write
 * created a second file next to the real one.
 *
 * That is not hypothetical - it is the shape of three fixes already in this
 * file's history:
 *   3d7cb9f3f  STNG: open(hi,'hiscores','R') ENOENT'd against the shipped
 *              `Doors/STNG/HISCORES`, and the 'W' open minted a lowercase
 *              twin that the next run read back as empty.
 *   fa55844c8  MultiTop asked for `bbs:bulletins/bull1.txt` against a real
 *              `Bulletins/`; bull1..bull5 stopped regenerating.
 *   158025e18  GWall's ENVARC: fallback minted `<bbsRoot>/gwall.cfg`.
 * Each was fixed at one call site. This fixes it in the shim, which is where
 * the rule belongs - `resolveExistingAncestors()` already existed for exactly
 * this and its own comment describes the bug ("mint a lowercase twin next to
 * the real, differently-cased parent"); the write paths just never used it.
 *
 * WHY THIS TEST MOCKS THE FILESYSTEM. It has to. `resolvePath()` opens with
 * `if (fs.existsSync(targetPath)) return targetPath` - and on the macOS/APFS
 * checkout that is TRUE for every spelling, so the shim returns the caller's
 * path unchanged and does nothing at all. Every bug in this class is invisible
 * in dev and only appears on the Linux container. A test against a real temp
 * directory here would pass on the broken code and prove nothing. So the FS
 * below is case-SENSITIVE, like the container, and the assertions are on the
 * path the shim hands to `fs`.
 *
 * WHY `require`, NOT `import * as fs`. Under @swc/jest an `import * as fs` is
 * compiled to `_interop_require_wildcard(require('fs'))`, which hands back a
 * COPY of the module's properties. Spying on that copy patches nothing that
 * amigafs can see - amigafs holds a copy of its own. `tests/live-data-guard.ts`
 * has the same note at the top of the file, and its first version shipped
 * green while letting a test delete the live Conf1/MsgBase/HeaderFile. So:
 * hold the real module object, patch it, and only THEN require amigafs, so
 * the copy it makes snapshots the patched functions.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs: typeof import('fs') = require('fs');
// Types only - a type-only import compiles away, so it makes no interop copy.
import type { PathLike, Stats, readdirSync, statSync, mkdirSync } from 'fs';

type Amigafs = typeof import('../../src/utils/amigafs');

/** A case-SENSITIVE in-memory filesystem, like the container's ext4. */
class SensitiveFs {
  // '/' is a real directory here: resolvePath() walks from the filesystem
  // root down, so a mock without a root resolves nothing at all.
  private readonly files = new Set<string>();
  private readonly dirs = new Set<string>(['/', '/vfs']);

  addFile(p: string): void {
    this.files.add(p);
    let dir = p.slice(0, p.lastIndexOf('/'));
    while (dir.length > 0) {
      this.dirs.add(dir);
      dir = dir.slice(0, dir.lastIndexOf('/'));
    }
  }

  addDir(p: string): void {
    this.dirs.add(p);
  }

  exists(p: string): boolean {
    return this.files.has(p) || this.dirs.has(p);
  }

  entries(dir: string): string[] {
    if (!this.dirs.has(dir)) throw new Error(`ENOENT: ${dir}`);
    const prefix = dir === '/' ? '/' : `${dir}/`;
    const out = new Set<string>();
    for (const p of [...this.files, ...this.dirs]) {
      if (!p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length);
      if (rest.length > 0) out.add(rest.split('/')[0]);
    }
    return [...out];
  }
}

describe('a write lands on the file that is already there', () => {
  let amigafs: Amigafs;
  let vfs: SensitiveFs;
  let wrote: string[];
  let made: string[];
  let renamed: Array<[string, string]>;
  let copied: Array<[string, string]>;

  beforeEach(() => {
    vfs = new SensitiveFs();
    wrote = [];
    made = [];
    renamed = [];
    copied = [];

    // The board's real shapes: a Bulletins drawer with upper-case contents,
    // and a door drawer with a shipped high-score file.
    vfs.addFile('/vfs/Bulletins/BULL1.TXT');
    vfs.addFile('/vfs/Doors/STNG/HISCORES');

    jest.spyOn(fs, 'existsSync').mockImplementation((p) => vfs.exists(String(p)));
    jest
      .spyOn(fs, 'statSync')
      .mockImplementation(((p: PathLike) => {
        if (!vfs.exists(String(p))) throw new Error(`ENOENT: ${String(p)}`);
        return { mtimeMs: 1 } as Stats;
      }) as unknown as typeof statSync);
    jest
      .spyOn(fs, 'readdirSync')
      .mockImplementation(((p: PathLike) => vfs.entries(String(p))) as unknown as typeof readdirSync);
    jest.spyOn(fs, 'writeFileSync').mockImplementation((p) => {
      wrote.push(String(p));
    });
    jest.spyOn(fs, 'mkdirSync').mockImplementation(((p: PathLike) => {
      made.push(String(p));
      return undefined;
    }) as unknown as typeof mkdirSync);
    jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      renamed.push([String(from), String(to)]);
    });
    jest.spyOn(fs, 'copyFileSync').mockImplementation((from, to) => {
      copied.push([String(from), String(to)]);
    });

    // AFTER the patch, never before - see the header. A fresh module also
    // means a fresh directory-listing cache.
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    amigafs = require('../../src/utils/amigafs');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('the mock filesystem is case-SENSITIVE, or none of this proves anything', () => {
    // The macOS checkout would answer true to both. The container answers
    // true to one. This test only means something under the second answer.
    expect(fs.existsSync('/vfs/Bulletins/BULL1.TXT')).toBe(true);
    expect(fs.existsSync('/vfs/bulletins/bull1.txt')).toBe(false);
  });

  it('writeFileSync overwrites the differently-cased file instead of adding a twin', () => {
    amigafs.writeFileSync('/vfs/bulletins/bull1.txt', 'regenerated');
    expect(wrote).toEqual(['/vfs/Bulletins/BULL1.TXT']);
  });

  it("writeFileSync gives a genuinely new file the caller's case, in the real drawer", () => {
    amigafs.writeFileSync('/vfs/bulletins/bull9.txt', 'new');
    expect(wrote).toEqual(['/vfs/Bulletins/bull9.txt']);
  });

  it("STNG's 'W' open of hiscores hits HISCORES, not a lowercase twin", () => {
    amigafs.writeFileSync('/vfs/doors/stng/hiscores', '1000');
    expect(wrote).toEqual(['/vfs/Doors/STNG/HISCORES']);
  });

  it('mkdirSync -p does not mint an intermediate beside the real one', () => {
    amigafs.mkdirSync('/vfs/bulletins/archive', { recursive: true });
    expect(made).toEqual(['/vfs/Bulletins/archive']);
  });

  it('renameSync onto a differently-cased destination replaces it', () => {
    vfs.addFile('/vfs/Bulletins/NEW.TXT');
    amigafs.renameSync('/vfs/bulletins/new.txt', '/vfs/bulletins/bull1.txt');
    expect(renamed).toEqual([['/vfs/Bulletins/NEW.TXT', '/vfs/Bulletins/BULL1.TXT']]);
  });

  it('copyFileSync onto a differently-cased destination replaces it', () => {
    amigafs.copyFileSync('/vfs/doors/stng/hiscores', '/vfs/bulletins/bull1.txt');
    expect(copied).toEqual([['/vfs/Doors/STNG/HISCORES', '/vfs/Bulletins/BULL1.TXT']]);
  });

  it('still refuses when the parent drawer does not exist at all', () => {
    expect(() => amigafs.writeFileSync('/vfs/NoSuchDrawer/x.txt', 'x')).toThrow(/ENOENT/);
    expect(wrote).toEqual([]);
  });
});
