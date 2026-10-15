/**
 * A batch line is Amiga-cased and Linux is not.
 *
 * "the entire bbs is supposed to be case insensitive" and "you never know what
 * sysops puts in the batch scripts" - the sysop, 2026-09-15.
 *
 * This board's line is
 *
 *     doors:quicknew/quicknew doors:quicknew/quicknew.config1 7 >bbs:screens/quicknew.txt
 *
 * and the directory on the volume is `Screens`. AmigaDOS does not care; ext4
 * does. Raw `fs.mkdirSync` takes the spelling literally, CREATES a second
 * lowercase `screens/`, and writes the door's output into a directory the board
 * never reads - while the screen resolver, which IS case-insensitive, goes on
 * showing the old file. That is the "two quicknew files" this repo has seen
 * before, and it is why QuickNew appeared to run and change nothing.
 *
 * `utils/amigafs` is the existing answer - it resolves existing ancestors
 * case-insensitively and creates only what genuinely is not there - so the test
 * is against that module rather than a private copy of the rule.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as amigafs from '../../src/utils/amigafs';

function aBoard(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amiga-case-'));
  // The volume spells it with a capital, the way this board really does.
  fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Screens', 'quicknew.txt'), 'the old screen');
  return root;
}

describe('a batch redirect that disagrees with the volume about case', () => {
  let root: string;

  beforeEach(() => { root = aBoard(); amigafs.forgetDirectoryListings(); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('writes the screen the board actually reads', () => {
    // What the batch line asks for, lowercase and all.
    const asked = path.join(root, 'screens', 'quicknew.txt');

    amigafs.mkdirSync(path.dirname(asked), { recursive: true });
    amigafs.writeFileSync(asked, 'the regenerated screen', 'utf8');

    expect(fs.readFileSync(path.join(root, 'Screens', 'quicknew.txt'), 'utf8'))
      .toBe('the regenerated screen');
  });

  it('does not leave a second directory behind', () => {
    const asked = path.join(root, 'screens', 'quicknew.txt');

    amigafs.mkdirSync(path.dirname(asked), { recursive: true });
    amigafs.writeFileSync(asked, 'the regenerated screen', 'utf8');

    const dirs = fs.readdirSync(root).filter(n => n.toLowerCase() === 'screens');
    expect(dirs).toEqual(['Screens']);
  });

  it('maps the lowercase batch spelling onto the real directory', () => {
    /*
     * Asserted through `findCaseInsensitive`, which searches the directory
     * listing, rather than through `resolvePath` or the filesystem.
     *
     * This repo is developed on macOS, whose default volume is ALREADY
     * case-insensitive: `resolvePath` short-circuits on a successful
     * `existsSync` and hands the lowercase spelling straight back, and a
     * `readdirSync` assertion passes for the wrong reason. The container runs
     * ext4 and does neither. The lookup below does the same work on both, so
     * it is the honest place to pin the rule.
     */
    expect(amigafs.findCaseInsensitive(root, 'screens')).toBe(path.join(root, 'Screens'));
    expect(amigafs.findCaseInsensitive(root, 'SCREENS')).toBe(path.join(root, 'Screens'));
  });

  it('answers null when the directory really is absent', () => {
    // Case-insensitive must not mean "finds anything".
    expect(amigafs.findCaseInsensitive(root, 'bulletins')).toBeNull();
  });

  it('still creates a directory that genuinely is not there', () => {
    // Case-insensitive must not mean "never create anything".
    const fresh = path.join(root, 'Bulletins', 'weekly.txt');

    amigafs.mkdirSync(path.dirname(fresh), { recursive: true });
    amigafs.writeFileSync(fresh, 'stats', 'utf8');

    expect(fs.existsSync(fresh)).toBe(true);
  });

  it('finds a door icon whatever the Amiga spelled it', () => {
    // getDoorTypeFromInfo reads `<door>.info` for TYPE=; missing it silently
    // downgrades the door to the SIM default.
    fs.writeFileSync(path.join(root, 'QuickNew.info'), 'icon');

    expect(amigafs.findCaseInsensitive(root, 'quicknew.INFO')).toBe(path.join(root, 'QuickNew.info'));
    expect(amigafs.findCaseInsensitive(root, 'QUICKNEW.info')).toBe(path.join(root, 'QuickNew.info'));
  });

  it('finds the batch file whatever the sysop spelled it', () => {
    fs.writeFileSync(path.join(root, 'Batch1'), 'doors:quicknew/quicknew');

    expect(amigafs.findCaseInsensitive(root, 'batch1')).toBe(path.join(root, 'Batch1'));
    expect(String(amigafs.readFileSync(path.join(root, 'batch1'), 'utf-8')))
      .toContain('quicknew');
  });
});
