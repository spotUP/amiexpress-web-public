/**
 * What a consumer BBS does with GET /doors/:archiveName once it has it.
 *
 * The manifest is a list: it has no version, no documentation, no suggested
 * tooltypes and no file rows, so mapManifestDoorToEntry left all of them at
 * a neutral default and every per-archive view rendered a door the repo
 * knows plenty about as if it knew nothing. mergeDoorDetailIntoEntry folds
 * the detail in; renderFileLines and formatSuggestedTooltypes are how the
 * info pane shows it; entryHasDoc is what tells the footer to offer [V].
 *
 * All four are pure - RepoView itself needs a live blessed Screen and is
 * not constructible here (see doorman-consumer-mode.test.ts's header).
 */
import {
  mergeDoorDetailIntoEntry,
  type CatalogEntry,
  type DoorDetailFields,
} from '../../../../Doors/door-manager/repoDataSource';
import {
  renderFileLines,
  formatSuggestedTooltypes,
  entryHasDoc,
} from '../../../../Doors/door-manager/repo-view-helpers';

function makeEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: 'X.LHA',
    archive_name: 'X.LHA',
    archive_path: '',
    binary_name: null,
    door_type: 'XIM',
    name: 'X',
    version: null,
    author: null,
    release_group: null,
    description: null,
    file_id_diz: null,
    doc_filename: null,
    doc_raw: null,
    suggested_tooltypes: null,
    category: null,
    archive_size: 0,
    junk_count: 0,
    installed: 0,
    installed_as: null,
    install_dir: null,
    ...overrides,
  };
}

function makeDetail(overrides: Partial<DoorDetailFields> = {}): DoorDetailFields {
  return {
    version: 'v2.0',
    fileIdDiz: 'DIZ TEXT',
    docFilename: 'Door.doc',
    doc: 'DOCUMENTATION',
    suggestedTooltypes: '{"TYPE":"XIM"}',
    junkCount: 2,
    hasDoc: true,
    description: 'from the repo',
    category: 'Utility',
    author: 'Someone',
    releaseGroup: 'DLT',
    ...overrides,
  };
}

describe('mergeDoorDetailIntoEntry', () => {
  it('fills every field the manifest leaves at a neutral default', () => {
    const merged = mergeDoorDetailIntoEntry(makeEntry(), makeDetail());

    expect(merged).toMatchObject({
      version: 'v2.0',
      file_id_diz: 'DIZ TEXT',
      doc_filename: 'Door.doc',
      doc_raw: 'DOCUMENTATION',
      suggested_tooltypes: '{"TYPE":"XIM"}',
      description: 'from the repo',
      category: 'Utility',
      author: 'Someone',
      release_group: 'DLT',
      junk_count: 2,
      has_doc: true,
    });
  });

  it('never overwrites what the entry already carries', () => {
    // An owner's row came from this BBS's own scan of its own archive; the
    // detail describes the central catalog's copy. Local wins, the same
    // rule the backend's description overlay follows.
    const entry = makeEntry({
      version: 'v1.0-local',
      file_id_diz: 'LOCAL DIZ',
      description: 'local description',
      doc_raw: 'LOCAL DOC',
      doc_filename: 'Local.doc',
      suggested_tooltypes: '{"TYPE":"AEDOOR"}',
    });

    expect(mergeDoorDetailIntoEntry(entry, makeDetail())).toMatchObject({
      version: 'v1.0-local',
      file_id_diz: 'LOCAL DIZ',
      description: 'local description',
      doc_raw: 'LOCAL DOC',
      doc_filename: 'Local.doc',
      suggested_tooltypes: '{"TYPE":"AEDOOR"}',
    });
  });

  it('leaves this node\'s own install state alone', () => {
    // The detail endpoint describes the catalog's copy of an archive, and
    // has no idea what this BBS installed or where.
    const entry = makeEntry({
      id: 'local-id-42',
      archive_path: 'FAME/X.LHA',
      binary_name: 'XDoor',
      installed: 1,
      installed_as: 'XDOOR',
      install_dir: 'Doors/XDOOR',
    });

    expect(mergeDoorDetailIntoEntry(entry, makeDetail())).toMatchObject({
      id: 'local-id-42',
      archive_path: 'FAME/X.LHA',
      binary_name: 'XDoor',
      installed: 1,
      installed_as: 'XDOOR',
      install_dir: 'Doors/XDOOR',
    });
  });

  it('keeps the manifest junk count when the detail carries none', () => {
    const merged = mergeDoorDetailIntoEntry(makeEntry({ junk_count: 5 }), makeDetail({ junkCount: 0 }));
    expect(merged.junk_count).toBe(5);
  });
});

describe('entryHasDoc', () => {
  it('is true for a consumer row that only carries the manifest flag', () => {
    // The regression: reading doc_raw alone kept [V]=Doc off the footer for
    // every consumer row, because a consumer holds no doc text until
    // something fetches it.
    expect(entryHasDoc(makeEntry({ has_doc: true }))).toBe(true);
  });

  it('is true for an owner row that carries the text itself', () => {
    expect(entryHasDoc(makeEntry({ doc_raw: 'DOC' }))).toBe(true);
  });

  it('is false for a row with neither, and for no row at all', () => {
    expect(entryHasDoc(makeEntry())).toBe(false);
    expect(entryHasDoc(null)).toBe(false);
  });
});

describe('renderFileLines', () => {
  it('reads both sources: is_junk from the local catalog, isJunk from the server', () => {
    const local = renderFileLines([{ path: 'ad.txt', size: 10, is_junk: 1 }]);
    const remote = renderFileLines([{ path: 'ad.txt', size: 10, isJunk: true }]);
    expect(local).toBe(remote);
    expect(local).toContain('1 ad files');
  });

  it('says clean when nothing is flagged', () => {
    expect(renderFileLines([{ path: 'door', size: 2048, isJunk: false }])).toContain('clean');
  });

  it('renders sizes in bytes below 1k and rounded k above', () => {
    const out = renderFileLines([
      { path: 'small', size: 10, isJunk: false },
      { path: 'big', size: 2048, isJunk: false },
    ]);
    expect(out).toContain('10b');
    expect(out).toContain('2k');
  });

  it('truncates a long path from the left, keeping the filename visible', () => {
    const out = renderFileLines([{ path: 'a'.repeat(30) + '/deep/name.txt', size: 1, isJunk: false }]);
    expect(out).toContain('<');
    expect(out).toContain('name.txt');
  });

  it('caps the listing and says how many were left out', () => {
    const files = Array.from({ length: 30 }, (_, i) => ({ path: `f${i}`, size: 1, isJunk: false }));
    expect(renderFileLines(files)).toContain('... and 5 more');
  });

  it('renders nothing at all for an empty listing', () => {
    expect(renderFileLines([])).toBe('');
  });
});

describe('formatSuggestedTooltypes', () => {
  it('reads the stored JSON object as NAME=value lines', () => {
    expect(formatSuggestedTooltypes('{"TYPE":"XIM","STACK":"10000"}')).toEqual([
      'TYPE=XIM',
      'STACK=10000',
    ]);
  });

  it('shows a row that is not a JSON object as it stands', () => {
    // Half the catalog's rows are scraped out of documentation and are
    // partial or plainly wrong; showing the raw value still tells the sysop
    // something, and none of it is ever written into an installed .info.
    expect(formatSuggestedTooltypes('TYPE=XIM')).toEqual(['TYPE=XIM']);
    expect(formatSuggestedTooltypes('["TYPE"]')).toEqual(['["TYPE"]']);
  });

  it('is empty for nothing at all', () => {
    expect(formatSuggestedTooltypes(null)).toEqual([]);
    expect(formatSuggestedTooltypes('')).toEqual([]);
    expect(formatSuggestedTooltypes('   ')).toEqual([]);
  });
});
