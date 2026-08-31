/**
 * The extractor is handed the path the disk really has.
 *
 * AmigaDOS is case-insensitive, so "Doors:" can reach the path layer as
 * "doors/". amigafs resolves that - which is why the existsSync guard in
 * Execute() passes - but the extractor uses plain fs, which on a
 * case-sensitive filesystem does not. The result was an archiver that worked
 * on macOS and failed on Linux CI, for four suites, with:
 *
 *   extraction failed: ENOENT, open '/tmp/.../doors/tiny-nested.lha'
 *
 * A destination usually does not exist yet - "doors:OUT/" is about to be
 * created - so it cannot be resolved directly. The deepest part that DOES
 * exist is resolved and the rest appended, or the extractor creates
 * "doors/OUT" beside the real "Doors/" and on Linux those are two different
 * directories.
 *
 * The case half of this cannot be tested on macOS, whose filesystem is
 * case-insensitive: the wrong path resolves there whatever the code does.
 * What IS testable on both is the parent walking, which is the part that
 * carries the resolved prefix through.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveAgainstExistingParent } from '../../src/amiga-emulation/api/DosLibrary';

describe('resolving a destination that does not exist yet', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dos-path-case-'));
    fs.mkdirSync(path.join(root, 'Doors'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('returns a path that exists unchanged', () => {
    const existing = path.join(root, 'Doors');
    expect(resolveAgainstExistingParent(existing)).toBe(existing);
  });

  it('keeps the part that does not exist, rooted at the part that does', () => {
    const target = path.join(root, 'Doors', 'OUT');
    expect(resolveAgainstExistingParent(target)).toBe(target);
  });

  it('walks up more than one missing level', () => {
    const target = path.join(root, 'Doors', 'OUT', 'nested', 'deep');
    expect(resolveAgainstExistingParent(target)).toBe(target);
  });

  it('gives the target back when nothing above it exists either', () => {
    const target = path.join(root, 'nope', 'still-nope');
    expect(resolveAgainstExistingParent(target)).toBe(target);
  });

  it('never returns an empty path', () => {
    for (const target of [root, path.join(root, 'a', 'b', 'c'), path.sep]) {
      expect(resolveAgainstExistingParent(target).length).toBeGreaterThan(0);
    }
  });
});
