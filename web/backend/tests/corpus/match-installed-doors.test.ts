/**
 * Regression tests for dev/scripts/door-corpus/match-installed-doors.ts —
 * the Task #14 backfill that links pre-catalog installed doors (BBSCmd
 * commands installed before door_catalog existed) to their catalog row so
 * DOORMAN's InstalledView can surface FILE_ID.DIZ for them.
 *
 * Covers the pure functions only (no DB, no archive extraction):
 *  - parseInfoLocation: byte-scan LOCATION= out of both this codebase's
 *    synthetic TEXT-format .info icons and real binary Amiga DiskObject
 *    icons (WB_DISKMAGIC), handling every LOCATION= prefix form actually
 *    found under Commands/BBSCmd/ ("Doors:", "doors:", "Doors/",
 *    "BBS:doors/") and rejecting locations rooted elsewhere
 *    (e.g. "bbs:amixnet/doors/REALNAMES" — a different command tree).
 *  - chooseCatalogRow: deterministic tie-break (DIZ-bearing row first,
 *    then lowest id) when more than one catalog row content-matches the
 *    same installed binary (duplicate archive releases).
 *  - candidateRowsForCommand: exact id/corpus_id/binary_name equality,
 *    then a length-gated archive/name stem-similarity fallback — this is
 *    only ever a *candidate* filter (every hit is still verified by
 *    content MD5 before anything is written), so it's tested for recall
 *    (does it find the right row) and for the length gate that keeps it
 *    from exploding on short tokens, not for zero false positives.
 *  - buildBasenameIndex: exact-basename lookup over door_catalog_files,
 *    including the backslash-path normalization regression (older
 *    LHA/LZH archives were packed with "\" separators; path.basename()
 *    doesn't split on those on POSIX, which is exactly the bug that
 *    made the first version of this script's MD5 matching fall from 20
 *    hits to 2 — see git history / the report for the full story).
 */
// better-sqlite3 lives in the repo-root node_modules (the script runs
// under tsx from dev/scripts) — it is NOT resolvable from web/backend, so
// jest needs a virtual mock before the module can load. Everything under
// test here is pure and never touches the DB. Mirrors
// build-door-catalog-fame.test.ts's existing pattern for the same reason.
jest.mock('better-sqlite3', () => ({ __esModule: true, default: class {} }), { virtual: true });

import {
  parseInfoLocation,
  chooseCatalogRow,
  candidateRowsForCommand,
  buildBasenameIndex,
  normalizeDir,
  alnumToken,
} from '../../../../dev/scripts/door-corpus/match-installed-doors';

describe('match-installed-doors: parseInfoLocation', () => {
  it('parses the synthetic TEXT-format icon LOCATION= (this codebase\'s own install format)', () => {
    const data = Buffer.from('TYPE=FIM\nLOCATION=Doors:5DPAGER/Doors/5D/5D_Page/5D_Page\nSTACK=65536\nACCESS=0\n', 'latin1');
    const result = parseInfoLocation('5DPAGER', data);
    expect(result).toEqual({
      cmd: '5DPAGER',
      dir: '5DPAGER',
      relPath: '5DPAGER/Doors/5D/5D_Page/5D_Page',
      binaryBasename: '5D_Page',
    });
  });

  it('parses LOCATION= out of a real binary Amiga DiskObject icon (NUL/CR-terminated tooltype, mixed-case value)', () => {
    // Trimmed excerpt of the real byte layout seen in Commands/BBSCmd/wall.info:
    // tooltype text is embedded raw in the binary icon, NUL-terminated.
    const data = Buffer.concat([
      Buffer.from([0xe3, 0x10, 0x00, 0x01]), // WB_DISKMAGIC header (not parsed, just realism)
      Buffer.from('junk-before'),
      Buffer.from('LOCATION=dOORS:dRE/dRE!WAll/dRE!WAll', 'latin1'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('MULTINODE=YES', 'latin1'),
    ]);
    const result = parseInfoLocation('wall', data);
    expect(result).toEqual({
      cmd: 'wall',
      dir: 'dRE',
      relPath: 'dRE/dRE!WAll/dRE!WAll',
      binaryBasename: 'dRE!WAll',
    });
  });

  it('accepts the TS-native door LOCATION form (plain "Doors/" path, no colon)', () => {
    const data = Buffer.from('TYPE=FIM\nLOCATION=Doors/galaga\n', 'latin1');
    expect(parseInfoLocation('GALAGA', data)).toEqual({
      cmd: 'GALAGA',
      dir: 'galaga',
      relPath: 'galaga',
      binaryBasename: 'galaga',
    });
  });

  it('accepts "BBS:doors/" prefixed locations', () => {
    const data = Buffer.from('LOCATION=BBS:doors/TurboLister/TurboLister.XiM\x00', 'latin1');
    expect(parseInfoLocation('DD', data)).toEqual({
      cmd: 'DD',
      dir: 'TurboLister',
      relPath: 'TurboLister/TurboLister.XiM',
      binaryBasename: 'TurboLister.XiM',
    });
  });

  it('returns null when LOCATION= is missing entirely', () => {
    const data = Buffer.from('TYPE=COM\nSTACK=4096\n', 'latin1');
    expect(parseInfoLocation('FONTTEST', data)).toBeNull();
  });

  it('returns null when LOCATION= is rooted outside the Doors: volume (different command tree)', () => {
    const data = Buffer.from('LOCATION=bbs:amixnet/doors/REALNAMES\x00', 'latin1');
    expect(parseInfoLocation('REALNAME', data)).toBeNull();
  });
});

describe('match-installed-doors: chooseCatalogRow', () => {
  it('prefers the row carrying a FILE_ID.DIZ over one that does not', () => {
    const rows = [
      { id: 'zzz_no_diz', file_id_diz: null, installed: 0, installed_as: null },
      { id: 'aaa_has_diz', file_id_diz: 'some diz text', installed: 0, installed_as: null },
    ];
    expect(chooseCatalogRow(rows)?.id).toBe('aaa_has_diz');
  });

  it('falls back to lowest id when DIZ presence ties (both or neither have one)', () => {
    const rows = [
      { id: 'zzz', file_id_diz: 'diz', installed: 0, installed_as: null },
      { id: 'aaa', file_id_diz: 'diz', installed: 0, installed_as: null },
    ];
    expect(chooseCatalogRow(rows)?.id).toBe('aaa');
  });

  it('returns null for an empty candidate list', () => {
    expect(chooseCatalogRow([])).toBeNull();
  });
});

describe('match-installed-doors: normalizeDir / alnumToken', () => {
  it('normalizeDir matches build-door-catalog.ts\'s archive-id convention (lowercase, non-alnum -> underscore)', () => {
    expect(normalizeDir('!!!War!!!')).toBe('___war___');
    expect(normalizeDir('5D-ZippySearch')).toBe('5d_zippysearch');
  });

  it('alnumToken strips all separators for cross-convention stem comparison', () => {
    expect(alnumToken('5D-ZippySearch')).toBe('5dzippysearch');
    expect(alnumToken("WarKick'Em")).toBe('warkickem');
  });
});

describe('match-installed-doors: candidateRowsForCommand', () => {
  const rows = [
    { id: 'conftop', binary_name: null, corpus_id: 'conftop', archive_name: 'CONFTOP.LHA', name: 'ConfTop' },
    { id: 'mst_cf23', binary_name: 'Usereditor', corpus_id: 'mst_cf23', archive_name: 'MST-CF23.LHA', name: 'MST ConfTop' },
    { id: 'unrelated', binary_name: null, corpus_id: 'unrelated', archive_name: 'SOMETHING-ELSE.LHA', name: 'Unrelated Door' },
  ];

  it('matches by exact id equality (normalized dir)', () => {
    const found = candidateRowsForCommand(rows, { dir: 'ConfTop', binaryBasename: 'Conftop020.x' });
    expect(found.map(r => r.id)).toContain('conftop');
  });

  it('matches by exact binary_name equality regardless of dir', () => {
    const found = candidateRowsForCommand(rows, { dir: 'SomethingCompletelyDifferent', binaryBasename: 'Usereditor' });
    expect(found.map(r => r.id)).toEqual(['mst_cf23']);
  });

  it('falls back to archive/name stem similarity when no exact hit exists', () => {
    const found = candidateRowsForCommand(rows, { dir: 'ConfTop', binaryBasename: 'NoSuchBinary' });
    // "conftop" is an exact id hit; "mst_cf23"'s name "MST ConfTop" contains
    // the "conftop" stem too, so both surface as candidates for downstream
    // MD5 verification. The unrelated row must not.
    const ids = found.map(r => r.id);
    expect(ids).toContain('conftop');
    expect(ids).toContain('mst_cf23');
    expect(ids).not.toContain('unrelated');
  });

  it('does not stem-match on short tokens (MIN_STEM_TOKEN_LEN gate)', () => {
    const shortRows = [
      // id/corpus_id/binary_name deliberately don't equal "sy" so only the
      // stem-similarity branch could produce a hit here.
      { id: 'unrelated_id', binary_name: null, corpus_id: null, archive_name: 'SYSTEMISH.LHA', name: 'Some Systemish Utility' },
    ];
    // "sy" (2 chars) must not blindly substring-match "SYSTEMISH"/"Systemish".
    const found = candidateRowsForCommand(shortRows, { dir: 'SY', binaryBasename: 'sy.rexx' });
    expect(found).toEqual([]);
  });

  it('returns no candidates when nothing matches at all', () => {
    const found = candidateRowsForCommand(rows, { dir: 'TotallyUnrelatedThing', binaryBasename: 'nope.exe' });
    expect(found).toEqual([]);
  });
});

describe('match-installed-doors: buildBasenameIndex', () => {
  it('indexes by exact basename, forward-slash paths', () => {
    const index = buildBasenameIndex([
      { catalog_id: 'mst_cf23', path: 'Doors/Conftop/Conftop020.x' },
      { catalog_id: 'mst_cf23', path: 'Doors/Conftop/Usereditor' },
    ]);
    expect(index.get('conftop020.x')).toEqual(new Set(['mst_cf23']));
    expect(index.get('usereditor')).toEqual(new Set(['mst_cf23']));
  });

  it('normalizes backslash-separated archive paths (regression: path.basename() does not split on "\\" on POSIX)', () => {
    // Real entry from an old DOS-packed archive, as seen in this repo's
    // door_catalog_files: "BBS\Doors\EmP_Tools\Bulls". A naive
    // path.basename() on POSIX returns the whole string unchanged, so
    // the very first version of the MD5-matching logic here never found
    // this file by name at all — build the index off a manually
    // slash/backslash-normalized split instead.
    const index = buildBasenameIndex([
      { catalog_id: 'emp_bl22', path: 'BBS\\Doors\\EmP_Tools\\Bulls' },
    ]);
    expect(index.get('bulls')).toEqual(new Set(['emp_bl22']));
    expect(index.has('bbs\\doors\\emp_tools\\bulls')).toBe(false);
  });

  it('merges catalog ids that share a basename across different archives', () => {
    const index = buildBasenameIndex([
      { catalog_id: 'a', path: 'Doors/who/who' },
      { catalog_id: 'b', path: 'Doors/AquaWho/who' },
    ]);
    expect(index.get('who')).toEqual(new Set(['a', 'b']));
  });
});
