/**
 * DOORMAN RepoView consumer mode: browsing the central door-repo API
 * instead of the local catalog.
 *
 * All logic under test lives in Doors/door-manager/repoDataSource.ts --
 * pure, blessed-free functions, same pattern as systemFilter.ts's tests
 * (doorman-system-filter.test.ts). RepoView itself is a thin blessed-UI
 * wrapper around these and is not instantiated here (it is not exported and
 * cannot be constructed without a live blessed Screen -- matches the
 * existing test suite's convention of testing the extracted pure logic).
 */
import {
  resolveDoorRepoMode,
  DEFAULT_DOOR_REPO_URL,
  mapManifestDoorToEntry,
  filterManifestEntries,
  formatOfflineSuffix,
  loadLocalCatalogEntries,
  loadConsumerCatalog,
  consumerCacheFilePath,
  type CatalogEntry,
  type LocalCatalogRow,
} from '../../../../Doors/door-manager/repoDataSource';
import { filterByDoorType, ALL_TYPES } from '../../../../Doors/door-manager/systemFilter';
import type { ManifestDoor, DoorRepoManifest } from '../../../../Doors/door-manager/repo-types.generated';
import type { RepoClientConfig, FetchManifestResult } from '../../../../Doors/door-manager/repo-client';

// ─── Mode selection matrix ──────────────────────────────────────────────────

describe('DOORMAN repoDataSource: resolveDoorRepoMode', () => {
  it('owner: DOOR_REPO_ROLE=owner, regardless of DOOR_REPO_URL', () => {
    expect(resolveDoorRepoMode({ DOOR_REPO_ROLE: 'owner' })).toEqual({ kind: 'owner' });
    expect(resolveDoorRepoMode({ DOOR_REPO_ROLE: 'owner', DOOR_REPO_URL: 'https://x' })).toEqual({
      kind: 'owner',
    });
    // owner check happens BEFORE the disabled check -- an owner box with an
    // explicitly empty DOOR_REPO_URL is still owner, not disabled.
    expect(resolveDoorRepoMode({ DOOR_REPO_ROLE: 'owner', DOOR_REPO_URL: '' })).toEqual({
      kind: 'owner',
    });
  });

  it('disabled: DOOR_REPO_URL is exactly the empty string (and not owner)', () => {
    expect(resolveDoorRepoMode({ DOOR_REPO_URL: '' })).toEqual({ kind: 'disabled' });
    expect(resolveDoorRepoMode({ DOOR_REPO_ROLE: 'consumer', DOOR_REPO_URL: '' })).toEqual({
      kind: 'disabled',
    });
  });

  it('consumer: DOOR_REPO_URL unset defaults to DEFAULT_DOOR_REPO_URL', () => {
    expect(resolveDoorRepoMode({})).toEqual({
      kind: 'consumer',
      url: DEFAULT_DOOR_REPO_URL,
      learnKey: null,
    });
    expect(DEFAULT_DOOR_REPO_URL).toBe('https://bbs.uprough.net');
  });

  it('consumer: DOOR_REPO_URL set to a non-empty value is used verbatim', () => {
    expect(resolveDoorRepoMode({ DOOR_REPO_URL: 'https://mirror.example' })).toEqual({
      kind: 'consumer',
      url: 'https://mirror.example',
      learnKey: null,
    });
  });

  // The owner-mode learn key rides along on consumer mode: it is what lets a
  // node identify itself to the repo it is learning from. These assertions
  // exist because the field was added to the returned object with nothing
  // covering it, which is how five of these tests came to be stale.
  it('consumer: carries DOORREPO_LEARN_KEY when one is set', () => {
    expect(resolveDoorRepoMode({ DOOR_REPO_URL: 'https://mirror.example', DOORREPO_LEARN_KEY: 'abc123' })).toEqual({
      kind: 'consumer',
      url: 'https://mirror.example',
      learnKey: 'abc123',
    });
  });

  it('consumer: treats a blank learn key as no key at all', () => {
    expect(resolveDoorRepoMode({ DOOR_REPO_URL: 'https://mirror.example', DOORREPO_LEARN_KEY: '   ' }).learnKey ?? null).toBeNull();
  });

  it('owner and disabled modes carry no learn key', () => {
    expect(resolveDoorRepoMode({ DOOR_REPO_ROLE: 'owner', DOORREPO_LEARN_KEY: 'abc123' })).toEqual({ kind: 'owner' });
    expect(resolveDoorRepoMode({ DOOR_REPO_URL: '', DOORREPO_LEARN_KEY: 'abc123' })).toEqual({ kind: 'disabled' });
  });
});

// ─── Owner/disabled parity: loadLocalCatalogEntries ─────────────────────────
//
// This is the extracted, byte-identical body of DOORMAN's pre-Task-6
// loadEntries() -- owner mode AND disabled mode both call this exact
// function in app.ts, so proving its behavior here is the owner-mode /
// disabled-mode parity regression test.

describe('DOORMAN repoDataSource: loadLocalCatalogEntries (owner/disabled parity)', () => {
  it('svc missing -> empty entries, repoUnavailable true (no throw)', () => {
    expect(loadLocalCatalogEntries(null, 'anything')).toEqual({
      entries: [],
      repoUnavailable: true,
    });
  });

  it('svc.searchCatalog throws -> empty entries, repoUnavailable true', () => {
    const svc = {
      searchCatalog: () => {
        throw new Error('no door_catalog table');
      },
    };
    expect(loadLocalCatalogEntries(svc, 'q')).toEqual({ entries: [], repoUnavailable: true });
  });

  it('svc.searchCatalog succeeds -> returns its rows verbatim, repoUnavailable false, called with the exact filter', () => {
    const rows: CatalogEntry[] = [makeEntry({ archive_name: 'FOO.LHA' })];
    const searchCatalog = jest.fn().mockReturnValue(rows);
    const result = loadLocalCatalogEntries({ searchCatalog }, 'foo');
    expect(result).toEqual({ entries: rows, repoUnavailable: false });
    expect(searchCatalog).toHaveBeenCalledWith('foo');
    expect(searchCatalog).toHaveBeenCalledTimes(1);
  });

  // ── lookupInstall (Task 5, review fix): owner mode's OWN local browse ───
  //
  // Review finding (commit 6bc3b54cc): an owner-mode install now records
  // ONLY to door_installs (never door_catalog), so a sysop's local browse
  // list -- sourced from door_catalog's searchCatalog -- would show every
  // freshly-installed door as never installed unless door_installs is
  // overlaid here too, the same way mapManifestDoorToEntry already overlays
  // it for the consumer browse view.

  it('lookupInstall omitted: rows pass through verbatim (byte-identical to pre-fix behavior)', () => {
    const rows: CatalogEntry[] = [makeEntry({ archive_name: 'FOO.LHA', installed: 1, installed_as: 'FOODOOR' })];
    const result = loadLocalCatalogEntries({ searchCatalog: () => rows }, 'foo');
    expect(result.entries).toEqual(rows);
  });

  it('lookupInstall provided: overlays installed/installed_as/install_dir from door_installs, keyed by archive_name', () => {
    const rows: CatalogEntry[] = [
      makeEntry({ archive_name: 'FOO.LHA', installed: 0, installed_as: null, install_dir: null }),
    ];
    const lookupInstall = jest.fn().mockReturnValue({ command: 'FOODOOR', install_dir: 'Doors/FOODOOR' });
    const result = loadLocalCatalogEntries({ searchCatalog: () => rows }, 'foo', lookupInstall);
    expect(lookupInstall).toHaveBeenCalledWith('FOO.LHA');
    expect(result.entries[0]).toMatchObject({ installed: 1, installed_as: 'FOODOOR', install_dir: 'Doors/FOODOOR' });
  });

  it('lookupInstall provided but returns null: installed stays 0 even when door_catalog carries a stale installed=1 row', () => {
    const rows: CatalogEntry[] = [
      makeEntry({ archive_name: 'FOO.LHA', installed: 1, installed_as: 'STALE', install_dir: 'Doors/STALE' }),
    ];
    const result = loadLocalCatalogEntries({ searchCatalog: () => rows }, 'foo', () => null);
    expect(result.entries[0]).toMatchObject({ installed: 0, installed_as: null, install_dir: null });
  });
});

// ─── Entry mapping: mapManifestDoorToEntry ──────────────────────────────────

function makeManifestDoor(overrides: Partial<ManifestDoor> = {}): ManifestDoor {
  return {
    archiveName: 'AETRIV10.LHA',
    doorType: 'XIM',
    name: '*** /X Door Trivia ***',
    author: null,
    releaseGroup: null,
    category: null,
    description: null,
    fileIdDiz: '*** /X Door Trivia ***\n',
    archiveSize: 16080,
    md5: '52ee1086c055fc1c82407dc0961ab04d',
    sha256: 'd918a826c5ea694ba2aca4a5e18f464f5947c59d85e6d1e15cc14341e805b367',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: 'x',
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

describe('DOORMAN repoDataSource: mapManifestDoorToEntry', () => {
  it('not installed locally: installed=0, install fields null, id/archive_path/binary_name fall back', () => {
    const door = makeManifestDoor();
    const entry = mapManifestDoorToEntry(door, () => null);
    expect(entry).toEqual({
      id: 'AETRIV10.LHA', // fallback: no local row, so archiveName stands in for id
      archive_name: 'AETRIV10.LHA',
      archive_path: '',
      binary_name: null,
      door_type: 'XIM',
      name: '*** /X Door Trivia ***',
      version: null,
      author: null,
      release_group: null,
      description: null,
      file_id_diz: '*** /X Door Trivia ***\n',
      doc_filename: null,
      doc_raw: null,
      suggested_tooltypes: null,
      category: null,
      archive_size: 16080,
      junk_count: 0,
      installed: 0,
      installed_as: null,
      install_dir: null,
    });
  });

  it('installed locally: installed resolved from the LOCAL lookup, not the manifest (manifest has no concept of it)', () => {
    const door = makeManifestDoor({ archiveName: 'AVH-BC01.LHA', name: 'AVH-BaudCheck v0.1' });
    const local: LocalCatalogRow = {
      id: 'local-id-42',
      installed: 1,
      installed_as: 'BAUDCHK',
      install_dir: 'Doors/BAUDCHK',
      binary_name: 'BaudCheck',
      archive_path: 'FAME/AVH-BC01.LHA',
    };
    const lookup = jest.fn().mockReturnValue(local);
    const entry = mapManifestDoorToEntry(door, lookup);
    expect(lookup).toHaveBeenCalledWith('AVH-BC01.LHA');
    expect(entry.installed).toBe(1);
    expect(entry.installed_as).toBe('BAUDCHK');
    expect(entry.install_dir).toBe('Doors/BAUDCHK');
    expect(entry.id).toBe('local-id-42');
    expect(entry.archive_path).toBe('FAME/AVH-BC01.LHA');
    expect(entry.binary_name).toBe('BaudCheck');
  });

  it('locally known but not currently installed (installed:0 row still returned) -> installed stays 0', () => {
    const door = makeManifestDoor();
    const local: LocalCatalogRow = {
      id: 'local-id-7',
      installed: 0,
      installed_as: null,
      install_dir: null,
      binary_name: null,
      archive_path: 'FAME/AETRIV10.LHA',
    };
    const entry = mapManifestDoorToEntry(door, () => local);
    expect(entry.installed).toBe(0);
    expect(entry.id).toBe('local-id-7'); // id still comes from the local row when one exists
  });

  it('null name falls back to archiveName; other nullable manifest fields pass through as null', () => {
    const door = makeManifestDoor({ name: null, author: null, releaseGroup: null, category: null, description: null, fileIdDiz: null });
    const entry = mapManifestDoorToEntry(door, () => null);
    expect(entry.name).toBe('AETRIV10.LHA');
    expect(entry.author).toBeNull();
    expect(entry.release_group).toBeNull();
    expect(entry.category).toBeNull();
    expect(entry.description).toBeNull();
    expect(entry.file_id_diz).toBeNull();
  });

  it('null archiveSize maps to 0, never null/NaN (view arithmetic on archive_size assumes a number)', () => {
    const door = makeManifestDoor({ archiveSize: null });
    const entry = mapManifestDoorToEntry(door, () => null);
    expect(entry.archive_size).toBe(0);
  });

  // ── lookupInstall (Task 5): door_installs, not door_catalog, is the ────
  // install-state source of truth. A consumer-mode install (installConsumerDoor)
  // now records directly into door_installs without ever touching door_catalog,
  // so `installed`/`installed_as`/`install_dir` must resolve from there --
  // lookupLocal alone (door_catalog) would show a freshly-installed door as
  // never installed.

  it('lookupInstall present with a record: installed/installed_as/install_dir resolve from door_installs, even with no local door_catalog row', () => {
    const door = makeManifestDoor({ archiveName: 'FOO.LHA' });
    const entry = mapManifestDoorToEntry(door, () => null, () => ({ command: 'FOODOOR', install_dir: 'Doors/FOODOOR' }));
    expect(entry.installed).toBe(1);
    expect(entry.installed_as).toBe('FOODOOR');
    expect(entry.install_dir).toBe('Doors/FOODOOR');
    // id/archive_path/binary_name still fall back the same way -- no local
    // door_catalog row exists for this archive.
    expect(entry.id).toBe('FOO.LHA');
  });

  it('lookupInstall present but returns null (never installed): installed stays 0 even when door_catalog shows a stale installed row', () => {
    const door = makeManifestDoor({ archiveName: 'FOO.LHA' });
    const local: LocalCatalogRow = {
      id: 'local-id-7', installed: 1, installed_as: 'STALE', install_dir: 'Doors/STALE',
      binary_name: null, archive_path: 'FAME/FOO.LHA',
    };
    const entry = mapManifestDoorToEntry(door, () => local, () => null);
    expect(entry.installed).toBe(0);
    expect(entry.installed_as).toBeNull();
    expect(entry.install_dir).toBeNull();
  });

  it('lookupInstall omitted entirely: falls back to the door_catalog-sourced fields (pre-Task-5 behavior, unchanged)', () => {
    const door = makeManifestDoor({ archiveName: 'FOO.LHA' });
    const local: LocalCatalogRow = {
      id: 'local-id-7', installed: 1, installed_as: 'LEGACY', install_dir: 'Doors/LEGACY',
      binary_name: null, archive_path: 'FAME/FOO.LHA',
    };
    const entry = mapManifestDoorToEntry(door, () => local);
    expect(entry.installed).toBe(1);
    expect(entry.installed_as).toBe('LEGACY');
    expect(entry.install_dir).toBe('Doors/LEGACY');
  });
});

// ─── Client-side filters on mapped rows ─────────────────────────────────────

describe('DOORMAN repoDataSource: filterManifestEntries (text filter, client-side)', () => {
  const entries: CatalogEntry[] = [
    makeEntry({ archive_name: 'AETRIV10.LHA', name: 'Trivia Door', author: null, release_group: null, description: null, installed_as: null }),
    makeEntry({ archive_name: 'AVH-BC01.LHA', name: 'AVH-BaudCheck', author: 'Spot', release_group: 'AVH', description: 'checks baud rate', installed_as: 'BAUDCHK' }),
    makeEntry({ archive_name: 'ZZZ.LHA', name: 'Zebra', author: null, release_group: null, description: null, installed_as: null }),
  ];

  it('empty query returns every row unchanged', () => {
    expect(filterManifestEntries(entries, '')).toBe(entries);
    expect(filterManifestEntries(entries, '   ')).toBe(entries);
  });

  it('matches archive_name substring, case-insensitively', () => {
    expect(filterManifestEntries(entries, 'avh-bc')).toEqual([entries[1]]);
  });

  it('matches name, author, release_group, description, installed_as', () => {
    expect(filterManifestEntries(entries, 'trivia')).toEqual([entries[0]]);
    expect(filterManifestEntries(entries, 'spot')).toEqual([entries[1]]);
    expect(filterManifestEntries(entries, 'AVH')).toEqual([entries[1]]); // release_group
    expect(filterManifestEntries(entries, 'baud rate')).toEqual([entries[1]]); // description
    expect(filterManifestEntries(entries, 'baudchk')).toEqual([entries[1]]); // installed_as
  });

  it('no match -> empty array', () => {
    expect(filterManifestEntries(entries, 'nonexistent-xyz')).toEqual([]);
  });
});

describe('DOORMAN repoDataSource + systemFilter: filters compose on mapped manifest rows', () => {
  it('text filter (filterManifestEntries) then system filter (filterByDoorType, unchanged) both apply to mapped rows', () => {
    const doors: ManifestDoor[] = [
      makeManifestDoor({ archiveName: 'AETRIV10.LHA', doorType: 'XIM', name: 'Trivia' }),
      makeManifestDoor({ archiveName: 'AVH-BC01.LHA', doorType: 'DD', name: 'BaudCheck' }),
      makeManifestDoor({ archiveName: 'AVH-BC02.LHA', doorType: 'DD', name: 'BaudCheck 2' }),
    ];
    const mapped = doors.map(d => mapManifestDoorToEntry(d, () => null));

    const textFiltered = filterManifestEntries(mapped, 'baudcheck');
    expect(textFiltered.map(e => e.archive_name)).toEqual(['AVH-BC01.LHA', 'AVH-BC02.LHA']);

    const typeOf = (e: CatalogEntry) => e.door_type || 'XIM';
    const bothFiltered = filterByDoorType(textFiltered, 'DD', typeOf);
    expect(bothFiltered.map(e => e.archive_name)).toEqual(['AVH-BC01.LHA', 'AVH-BC02.LHA']);

    const allTypeNoOp = filterByDoorType(textFiltered, ALL_TYPES, typeOf);
    expect(allTypeNoOp).toBe(textFiltered);
  });
});

// ─── Offline header suffix ───────────────────────────────────────────────────

describe('DOORMAN repoDataSource: formatOfflineSuffix', () => {
  it('fromCache false -> empty string (no suffix on a fresh fetch)', () => {
    expect(formatOfflineSuffix(false, '2026-08-16T10:00:00.000Z')).toBe('');
    expect(formatOfflineSuffix(false, null)).toBe('');
  });

  it('fromCache true -> " OFFLINE (cached <date>)" using the cache date', () => {
    expect(formatOfflineSuffix(true, '2026-08-16T10:00:00.000Z')).toBe(' OFFLINE (cached 2026-08-16)');
  });

  it('fromCache true with no cachedAt -> falls back to "unknown date" rather than crashing', () => {
    expect(formatOfflineSuffix(true, null)).toBe(' OFFLINE (cached unknown date)');
  });
});

// ─── consumerCacheFilePath ───────────────────────────────────────────────────

describe('DOORMAN repoDataSource: consumerCacheFilePath', () => {
  it('joins the given bbsRoot with door-repo-cache.json (never a hardcoded/guessed root)', () => {
    const p = consumerCacheFilePath('/app/data/bbs');
    expect(p.endsWith('door-repo-cache.json')).toBe(true);
    expect(p.startsWith('/app/data/bbs')).toBe(true);
  });
});

// ─── loadConsumerCatalog: consumer-fresh / consumer-cached-offline ──────────

function makeManifest(doors: ManifestDoor[]): DoorRepoManifest {
  return { formatVersion: 1, revision: 'abc123', generatedAt: '2026-08-16T10:00:00.000Z', doors };
}

describe('DOORMAN repoDataSource: loadConsumerCatalog', () => {
  it('consumer-fresh: fromCache:false passes through, every door mapped, local lookup applied per row', async () => {
    const doors = [
      makeManifestDoor({ archiveName: 'A.LHA' }),
      makeManifestDoor({ archiveName: 'B.LHA' }),
    ];
    const fetchManifestFn = jest.fn(
      async (cfg: RepoClientConfig): Promise<FetchManifestResult> => {
        expect(cfg).toEqual({ url: 'https://bbs.uprough.net', cacheFile: '/data/door-repo-cache.json' });
        return { manifest: makeManifest(doors), fromCache: false, cachedAt: '2026-08-16T10:00:00.000Z' };
      }
    );
    const localRows: Record<string, LocalCatalogRow> = {
      'A.LHA': { id: 'local-a', installed: 1, installed_as: 'ADOOR', install_dir: 'Doors/ADOOR', binary_name: null, archive_path: null },
    };
    const lookupLocal = jest.fn((name: string) => localRows[name] ?? null);

    const result = await loadConsumerCatalog(
      'https://bbs.uprough.net',
      '/data/door-repo-cache.json',
      lookupLocal,
      fetchManifestFn
    );

    expect(result.fromCache).toBe(false);
    expect(result.cachedAt).toBe('2026-08-16T10:00:00.000Z');
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].archive_name).toBe('A.LHA');
    expect(result.entries[0].installed).toBe(1);
    expect(result.entries[0].installed_as).toBe('ADOOR');
    expect(result.entries[1].archive_name).toBe('B.LHA');
    expect(result.entries[1].installed).toBe(0);
    expect(lookupLocal).toHaveBeenCalledWith('A.LHA');
    expect(lookupLocal).toHaveBeenCalledWith('B.LHA');
    expect(fetchManifestFn).toHaveBeenCalledTimes(1);
  });

  it('consumer-cached-offline: fromCache:true passes through unchanged (caller uses it for the OFFLINE header suffix)', async () => {
    const fetchManifestFn = jest.fn(async (): Promise<FetchManifestResult> => ({
      manifest: makeManifest([makeManifestDoor()]),
      fromCache: true,
      cachedAt: '2026-08-10T00:00:00.000Z',
    }));

    const result = await loadConsumerCatalog(
      'https://bbs.uprough.net',
      '/data/door-repo-cache.json',
      () => null,
      fetchManifestFn
    );

    expect(result.fromCache).toBe(true);
    expect(result.cachedAt).toBe('2026-08-10T00:00:00.000Z');
    expect(formatOfflineSuffix(result.fromCache, result.cachedAt)).toBe(' OFFLINE (cached 2026-08-10)');
  });

  it('propagates a loud failure (no cache, network down) rather than returning an empty catalog silently', async () => {
    const fetchManifestFn = jest.fn(async (): Promise<FetchManifestResult> => {
      throw new Error('DOOR REPO: manifest fetch failed (ECONNREFUSED) and no cache exists at /data/door-repo-cache.json');
    });
    await expect(
      loadConsumerCatalog('https://bbs.uprough.net', '/data/door-repo-cache.json', () => null, fetchManifestFn)
    ).rejects.toThrow(/DOOR REPO: manifest fetch failed/);
  });

  it('threads the optional lookupInstall param into every mapped row (Task 5: door_installs-backed browse state)', async () => {
    const doors = [
      makeManifestDoor({ archiveName: 'A.LHA' }),
      makeManifestDoor({ archiveName: 'B.LHA' }),
    ];
    const fetchManifestFn = jest.fn(async (): Promise<FetchManifestResult> => (
      { manifest: makeManifest(doors), fromCache: false, cachedAt: null }
    ));
    const lookupInstall = jest.fn((name: string) => (name === 'A.LHA' ? { command: 'ADOOR', install_dir: 'Doors/ADOOR' } : null));

    const result = await loadConsumerCatalog(
      'https://bbs.uprough.net', '/data/door-repo-cache.json', () => null, fetchManifestFn, lookupInstall
    );

    expect(lookupInstall).toHaveBeenCalledWith('A.LHA');
    expect(lookupInstall).toHaveBeenCalledWith('B.LHA');
    expect(result.entries[0]).toMatchObject({ archive_name: 'A.LHA', installed: 1, installed_as: 'ADOOR' });
    expect(result.entries[1]).toMatchObject({ archive_name: 'B.LHA', installed: 0, installed_as: null });
  });
});
