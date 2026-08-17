/**
 * Regression test for dev/scripts/door-corpus/build-door-catalog.ts's primary-
 * binary detection loop.
 *
 * Found while indexing Archives/DayDream/: several archives (CZE-SENT.LHA,
 * FRS-COM4.LHA, FRS-LBL3.LHA, FRS-M2N4.LHA, FRS-PWF3.LHA) bundle a scene-group
 * self-running ad-tro (repacked under names like "eX-tRACT.exe" / "LE-win5-
 * 96.exe") that is itself a valid Amiga Hunk executable. The archive's real
 * door is an AREXX .dd script with no Hunk binary of its own, so the old
 * "first isCandidateBinaryEntry + isAmigaHunk match wins" loop would pick the
 * ad-tro as the door's binary_name and stamp door_type from its (door-marker-
 * free) bytes instead of leaving binary_name/door_type unset.
 *
 * The ad-tro's filename already matches an existing STRIPPER_SOURCES-derived
 * filenamePattern (the same list the file-listing junk_count pass uses) — so
 * the fix reuses that existing pattern list one loop earlier via
 * isKnownJunkBinaryName, rather than inventing a new junk-detection path.
 */
// better-sqlite3 lives in web/backend/node_modules and is only resolvable at
// runtime via NODE_PATH (see build-door-catalog.ts's usage comment) — not
// resolvable from jest's module graph without a virtual mock. Mirrors
// build-door-catalog-fame.test.ts's identical pattern for the same reason;
// nothing under test here touches the DB.
jest.mock('better-sqlite3', () => ({ __esModule: true, default: class {} }), { virtual: true });

import { isKnownJunkBinaryName, isCandidateBinaryEntry } from '../../../../dev/scripts/door-corpus/build-door-catalog';

describe('build-door-catalog: isKnownJunkBinaryName', () => {
  const filenamePatterns = ['ex-tract.exe', 'le-win*', 'do-xtreme.exe'];

  it('flags the real DayDream ad-tro filenames that match known stripper patterns', () => {
    expect(isKnownJunkBinaryName('eX-tRACT.exe', filenamePatterns)).toBe(true);
    expect(isKnownJunkBinaryName('LE-win5-96.exe', filenamePatterns)).toBe(true);
    expect(isKnownJunkBinaryName('dO-xTREME.exe', filenamePatterns)).toBe(true);
  });

  it('matches on basename even when the archive entry has a path prefix', () => {
    expect(isKnownJunkBinaryName('some/dir/eX-tRACT.exe', filenamePatterns)).toBe(true);
  });

  it('does not flag a real door binary that happens to share the .exe extension', () => {
    expect(isKnownJunkBinaryName('doors/Bridge.exe', filenamePatterns)).toBe(false);
  });

  it('still passes isCandidateBinaryEntry (the fix layers a second check, not a replacement)', () => {
    expect(isCandidateBinaryEntry('eX-tRACT.exe')).toBe(true);
    expect(isKnownJunkBinaryName('eX-tRACT.exe', filenamePatterns)).toBe(true);
  });

  it('with an empty pattern list, never flags anything (fail-open, matches pre-fix behavior)', () => {
    expect(isKnownJunkBinaryName('eX-tRACT.exe', [])).toBe(false);
  });
});
