/**
 * Regression: synthesizeACPTooltypes must derive NDIRS from actual DIR files
 * on disk, not only from ConfConfig.info.
 *
 * Root cause: ConfConfig.info was created at install time with NDIRS=1.
 * As uploads created DIR2, DIR3, …, DIR24, neither ConfConfig.info nor the
 * NDIRS tooltype returned to AquaScan was updated.  AquaScan read NDIRS=1
 * and only scanned DIR1, showing only the original Feb-2026 files.
 *
 * Fix: IconLibrary.synthesizeACPTooltypes now counts the highest-numbered
 * DIRn file in each conference directory and uses max(ConfConfig.info, count)
 * so the returned NDIRS is always at least as large as the true dir count.
 *
 * Driven through the REAL IconLibrary on a temp board, the same way
 * tests/services/conference-directory-honours-location.test.ts reaches it:
 * a conference whose ConfConfig.info says NDIRS=1 while its directory holds
 * the DIRn files, and the NDIRS the door would be handed is read back.
 * (This file used to test a copy of the counting loop, tied to production
 * only by a regex over IconLibrary.ts.)
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyTooltypes } from '../src/utils/info-file.util';
import { IconLibrary } from '../src/amiga-emulation/api/IconLibrary';

/** The NDIRS a door is handed by GetDiskObject's synthesized ACP icon. */
function ndirsFor(bbsRoot: string): string | undefined {
  const icons = new IconLibrary({} as never, bbsRoot);
  const tooltypes = (
    icons as unknown as { synthesizeACPTooltypes: () => string[] }
  ).synthesizeACPTooltypes();
  return tooltypes.find((t) => t.startsWith('NDIRS='));
}

describe('IconLibrary synthesizeACPTooltypes NDIRS', () => {
  let root: string;
  let conf1: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-ndirs-'));
    // One conference, found by its directory (no board-level ConfConfig.info).
    conf1 = path.join(root, 'Conf1');
    fs.mkdirSync(conf1, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** The conference's own ConfConfig.info, carrying the install-time NDIRS. */
  function confConfigSays(ndirs: number): void {
    applyTooltypes(path.join(conf1, 'ConfConfig.info'), [['NDIRS', String(ndirs)]]);
  }

  function dirs(...names: string[]): void {
    for (const name of names) fs.writeFileSync(path.join(conf1, name), '');
  }

  test('a stale NDIRS=1 is raised to the highest DIRn on disk', () => {
    confConfigSays(1);
    dirs('DIR1', 'DIR3', 'DIR7', 'DIR12', 'DIR24');

    expect(ndirsFor(root)).toBe('NDIRS=24');
  });

  test('counts a lowercase dir24 the same as DIR24', () => {
    confConfigSays(1);
    dirs('DIR1', 'dir24');

    expect(ndirsFor(root)).toBe('NDIRS=24');
  });

  test('ignores files that are not DIRn', () => {
    confConfigSays(1);
    dirs('NDIRS', 'Upload', 'FILES.BBS', 'DIR3', 'DIR99.bak');

    expect(ndirsFor(root)).toBe('NDIRS=3');
  });

  test('keeps ConfConfig.info when it is the higher of the two', () => {
    confConfigSays(30);
    dirs('DIR1', 'DIR3');

    expect(ndirsFor(root)).toBe('NDIRS=30');
  });
});
