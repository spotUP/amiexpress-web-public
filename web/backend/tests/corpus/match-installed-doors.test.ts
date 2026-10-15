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
 *  - entryBasename + matchEntriesByBasename: the LIVE archive-scan path
 *    used by md5OfNamedEntry — the code that actually carried the two
 *    shipped bug fixes. entryBasename covers the backslash-separator
 *    regression (older LHA/LZH archives were packed with "\" separators;
 *    path.basename() doesn't split on those on POSIX — the bug that made
 *    the MD5 matching fall from 20 hits to 2). matchEntriesByBasename
 *    covers the multi-door-bundle wrong-binary regression (MST-CF23.LHA:
 *    match the command's own target basename, never the archive's stored
 *    binary_name / first-HUNK guess).
 *  - buildBasenameIndex: exact-basename lookup over door_catalog_files
 *    (built on the same entryBasename helper).
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
  entryBasename,
  matchEntriesByBasename,
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

describe('match-installed-doors: entryBasename (live archive-scan path)', () => {
  // Regression for the v2 bug: entryBasename originally used
  // path.basename(), which on POSIX does not split on "\" — so a
  // DOS/Amiga-packed entry name like "BBS\Doors\EmP_Tools\Bulls" returned
  // the WHOLE string and md5OfNamedEntry never found "Bulls" by name.
  // That single line silently dropped the backfill's MD5 match count from
  // 20 to 2. This test fails if entryBasename reverts to path.basename().
  it('splits backslash-separated archive entry names (regression: path.basename() keeps them whole on POSIX)', () => {
    expect(entryBasename('BBS\\Doors\\EmP_Tools\\Bulls')).toBe('Bulls');
    expect(entryBasename('BBS\\Doors\\EmP_Tools\\Bulls')).not.toBe('BBS\\Doors\\EmP_Tools\\Bulls');
  });

  it('splits forward-slash entry names and mixed separators', () => {
    expect(entryBasename('Doors/Conftop/Conftop020.x')).toBe('Conftop020.x');
    expect(entryBasename('BBS\\Doors/EmP_Tools\\Bulls')).toBe('Bulls');
  });

  it('returns a bare filename unchanged', () => {
    expect(entryBasename('KickBox.Rexx')).toBe('KickBox.Rexx');
  });
});

describe('match-installed-doors: matchEntriesByBasename (live archive-scan path)', () => {
  // Regression for the v1 bug: matching originally trusted
  // door_catalog.binary_name — build-door-catalog.ts's stored "first HUNK
  // binary found" guess — instead of the installed command's own target
  // filename. Verified real case: MST-CF23.LHA is a multi-door bundle
  // shipping BOTH Doors/Conftop/Conftop020.x (the door the CONFTOP
  // command installs) and an unrelated Doors/Conftop/Usereditor;
  // build-door-catalog stamped binary_name = "Usereditor" because
  // isCandidateBinaryEntry rejects ".x"-suffixed names
  // (AMIGA_68K_BINARY_EXT_RE doesn't cover that classic-AmigaDOS
  // extension). The fix scans the live entry list for the target's OWN
  // basename. This test fails against the pre-fix semantics (which would
  // select Usereditor / whatever the extension gate picked).
  const mstCf23Entries = [
    { name: 'Doors/Conftop/Conftop020.x' },
    { name: 'Doors/Conftop/Usereditor' },
    { name: 'Doors/Conftop/Conftop.doc' },
    { name: 'Doors/Conftop/' },
  ];

  it('selects the target basename from a multi-door bundle, not the archive\'s "first binary" (MST-CF23 wrong-binary regression)', () => {
    const matches = matchEntriesByBasename(mstCf23Entries, 'Conftop020.x');
    expect(matches.map(m => m.name)).toEqual(['Doors/Conftop/Conftop020.x']);
    // The pre-fix behavior effectively matched Usereditor (the stored
    // binary_name); assert it is NOT selected for this target.
    expect(matches.map(m => m.name)).not.toContain('Doors/Conftop/Usereditor');
  });

  it('matches regardless of extension conventions (".x" is fine — no AMIGA_68K_BINARY_EXT_RE gate)', () => {
    expect(matchEntriesByBasename(mstCf23Entries, 'conftop020.X')).toHaveLength(1);
  });

  it('finds backslash-packed entries by basename (v2 regression through the real call path)', () => {
    const entries = [
      { name: 'BBS\\Doors\\EmP_Tools\\Bulls' },
      { name: 'BBS\\Doors\\EmP_Tools\\Bulls.doc' },
    ];
    const matches = matchEntriesByBasename(entries, 'Bulls');
    expect(matches.map(m => m.name)).toEqual(['BBS\\Doors\\EmP_Tools\\Bulls']);
  });

  it('excludes directory entries (trailing "/" or "\\")', () => {
    const entries = [
      { name: 'Doors/Conftop/' },
      { name: 'BBS\\Doors\\EmP_Tools\\' },
    ];
    expect(matchEntriesByBasename(entries, 'Conftop')).toEqual([]);
    expect(matchEntriesByBasename(entries, 'EmP_Tools')).toEqual([]);
  });

  it('is case-insensitive (Amiga filesystems are)', () => {
    const entries = [{ name: 'Doors/KickBox.Rexx' }];
    expect(matchEntriesByBasename(entries, 'kickbox.rexx')).toHaveLength(1);
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
