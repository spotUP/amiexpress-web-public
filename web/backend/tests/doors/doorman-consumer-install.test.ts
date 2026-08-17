/**
 * Task 7: consumer-mode install-from-download.
 *
 * Doors/door-manager/app.ts's doInstallUninstall wires two exported,
 * blessed-free orchestration functions:
 *
 *   - extractAndRegisterDoor: the shared install core (extract, write
 *     .info, persist install state, refresh the door registry). BOTH owner
 *     mode (a local archive already resolved via resolveArchivePath) and
 *     consumer mode (an archive downloaded from the central repo) funnel
 *     through this exact function once they have a real archivePath on
 *     disk -- this is what keeps owner-mode behavior unchanged.
 *
 *   - installConsumerDoor: consumer-only. Fetches the central manifest,
 *     looks up the archive's sha256, downloads+verifies via repo-client's
 *     downloadArchive into tmp-door-repo/, then delegates to
 *     extractAndRegisterDoor for the rest. Always cleans up the downloaded
 *     temp file, on every path (success or failure).
 *
 * RepoView itself is not exported and cannot be constructed without a live
 * blessed Screen (same convention as doorman-consumer-mode.test.ts), so
 * this suite drives the two exported functions directly with injected
 * deps -- exactly how RepoView's doInstallUninstall wires them for real.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Mocked BEFORE importing app.ts so app.ts's own `import { downloadArchive,
// fetchManifest } from './repo-client'` resolves to these jest.fn()s --
// this is what lets the owner-mode-parity test assert, on the real
// production import binding, that consumer-only network calls never fire
// for an owner-mode install.
jest.mock('../../../../Doors/door-manager/repo-client', () => ({
  downloadArchive: jest.fn(),
  fetchManifest: jest.fn(),
}));

import {
  extractAndRegisterDoor,
  installConsumerDoor,
  catalogIdForArchive,
  CONSUMER_INSTALL_SOURCE,
  type InstallDeps,
  type ConsumerInstallDeps,
  type ConsumerCatalogUpsertRow,
} from '../../../../Doors/door-manager/app';
import { downloadArchive, fetchManifest } from '../../../../Doors/door-manager/repo-client';
import type { DoorRepoManifest, ManifestDoor } from '../../../../Doors/door-manager/repo-types.generated';
import type { RepoClientConfig, FetchManifestResult } from '../../../../Doors/door-manager/repo-client';
import { mapManifestDoorToEntry } from '../../../../Doors/door-manager/repoDataSource';
import type { LocalCatalogRow, LocalCatalogLookup } from '../../../../Doors/door-manager/repoDataSource';

const mockDownloadArchive = downloadArchive as jest.MockedFunction<typeof downloadArchive>;
const mockFetchManifest = fetchManifest as jest.MockedFunction<typeof fetchManifest>;

const SHA256 = 'a'.repeat(64);

function makeManifestDoor(overrides: Partial<ManifestDoor> = {}): ManifestDoor {
  return {
    archiveName: 'FOO.LHA',
    doorType: 'XIM',
    name: 'Foo Door',
    author: null,
    releaseGroup: null,
    category: null,
    description: null,
    fileIdDiz: null,
    archiveSize: 1234,
    md5: null,
    sha256: SHA256,
    ...overrides,
  };
}

function makeManifest(doors: ManifestDoor[]): DoorRepoManifest {
  return { formatVersion: 1, revision: 'rev1', generatedAt: '2026-08-17T00:00:00.000Z', doors };
}

const CFG: RepoClientConfig = { url: 'https://bbs.uprough.net', cacheFile: '/data/door-repo-cache.json' };

beforeEach(() => {
  mockDownloadArchive.mockReset();
  mockFetchManifest.mockReset();
});

// ─── extractAndRegisterDoor: the shared owner/consumer install core ─────────

describe('DOORMAN app.ts: extractAndRegisterDoor (shared install core)', () => {
  function baseDeps(overrides: Partial<InstallDeps> = {}): InstallDeps {
    return {
      extractArchiveTo: jest.fn().mockResolvedValue({ ok: true, fileCount: 3 }),
      findExtractedBinary: jest.fn().mockReturnValue('BIN'),
      writeInfoFile: jest.fn(),
      markInstalled: jest.fn(),
      refreshDoorRegistry: jest.fn().mockResolvedValue(true),
      ...overrides,
    };
  }

  it('extract failure surfaces step "extract" and skips write-info/markInstalled', async () => {
    const deps = baseDeps({
      extractArchiveTo: jest.fn().mockResolvedValue({ ok: false, fileCount: 0, error: 'bad archive' }),
    });
    const outcome = await extractAndRegisterDoor(
      '/archives/FOO.LHA', '/doors/FOO', '/cmd/FOO.info', 'XIM', 'FOO', 'FOO', deps
    );
    expect(outcome).toEqual({ ok: false, step: 'extract', detail: 'bad archive' });
    expect(deps.writeInfoFile).not.toHaveBeenCalled();
    expect(deps.markInstalled).not.toHaveBeenCalled();
  });

  it('success: calls extractArchiveTo with the given archivePath, writes info, marks installed, refreshes registry', async () => {
    const deps = baseDeps();
    const outcome = await extractAndRegisterDoor(
      '/archives/FOO.LHA', '/doors/FOO', '/cmd/FOO.info', 'FIM', 'FOO', 'FOO', deps
    );
    expect(deps.extractArchiveTo).toHaveBeenCalledWith('/archives/FOO.LHA', '/doors/FOO');
    expect(deps.writeInfoFile).toHaveBeenCalledWith('/cmd/FOO.info', expect.stringContaining('TYPE=FIM'));
    expect(deps.markInstalled).toHaveBeenCalledTimes(1);
    expect(deps.refreshDoorRegistry).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ ok: true, doorType: 'FIM', fileCount: 3, binaryRel: 'BIN' });
  });

  // ── Owner-mode parity ──────────────────────────────────────────────────
  //
  // Owner mode's install branch in doInstallUninstall calls exactly this
  // function with an InstallDeps object that has no reference to
  // downloadArchive/fetchManifest at all -- proving, on the real
  // production module binding (mocked above), that an owner-mode install
  // never touches the central-repo network client.

  it('owner-mode parity: downloadArchive/fetchManifest are never called; the given archivePath is used as-is', async () => {
    const deps = baseDeps();
    const outcome = await extractAndRegisterDoor(
      '/local/archives/FOO.LHA', '/doors/FOO', '/cmd/FOO.info', 'XIM', 'FOO', 'FOO', deps
    );
    expect(outcome.ok).toBe(true);
    expect(deps.extractArchiveTo).toHaveBeenCalledWith('/local/archives/FOO.LHA', '/doors/FOO');
    expect(mockDownloadArchive).not.toHaveBeenCalled();
    expect(mockFetchManifest).not.toHaveBeenCalled();
  });
});

// ─── installConsumerDoor: download+verify, then extractAndRegisterDoor ──────

describe('DOORMAN app.ts: installConsumerDoor (consumer download-install)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doorman-consumer-install-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function baseDeps(overrides: Partial<ConsumerInstallDeps> = {}): ConsumerInstallDeps {
    return {
      fetchManifest: mockFetchManifest,
      downloadArchive: mockDownloadArchive,
      extractArchiveTo: jest.fn().mockResolvedValue({ ok: true, fileCount: 2 }),
      findExtractedBinary: jest.fn().mockReturnValue('FOO'),
      writeInfoFile: jest.fn(),
      lookupLocal: jest.fn().mockReturnValue(null),
      getCatalogEntry: jest.fn().mockReturnValue(null),
      upsertCatalogEntry: jest.fn(),
      markInstalled: jest.fn(),
      refreshDoorRegistry: jest.fn().mockResolvedValue(true),
      mkdir: (dir: string) => fs.mkdirSync(dir, { recursive: true }),
      unlink: (p: string) => { try { fs.unlinkSync(p); } catch { /* already gone */ } },
      ...overrides,
    };
  }

  // ── Fake local door_catalog, in-memory ───────────────────────────────
  //
  // Backs lookupLocal/getCatalogEntry/upsertCatalogEntry/markInstalled with
  // ONE shared Map, so tests can drive installConsumerDoor and then check
  // the resulting local state through the exact same read path RepoView's
  // real browse view uses (repoDataSource.ts's mapManifestDoorToEntry) --
  // not just assert "upsert was called".
  interface FakeRow {
    id: string; archive_name: string; archive_path: string; binary_name: string | null;
    installed: number; installed_as: string | null; install_dir: string | null;
  }

  function makeFakeLocalCatalog() {
    const rows = new Map<string, FakeRow>();
    const lookupLocal: LocalCatalogLookup = (archiveName: string): LocalCatalogRow | null => {
      for (const row of rows.values()) {
        if (row.archive_name === archiveName) {
          return {
            id: row.id, installed: row.installed, installed_as: row.installed_as,
            install_dir: row.install_dir, binary_name: row.binary_name, archive_path: row.archive_path,
          };
        }
      }
      return null;
    };
    const getCatalogEntry = jest.fn((id: string): { archive_name: string } | null => {
      const row = rows.get(id);
      return row ? { archive_name: row.archive_name } : null;
    });
    const upsertCatalogEntry = jest.fn((entry: ConsumerCatalogUpsertRow) => {
      rows.set(entry.id, {
        id: entry.id, archive_name: entry.archive_name, archive_path: entry.archive_path,
        binary_name: entry.binary_name, installed: entry.installed, installed_as: entry.installed_as,
        install_dir: entry.install_dir,
      });
    });
    const markInstalled = jest.fn((id: string, cmd: string, dir: string) => {
      const row = rows.get(id);
      if (row) { row.installed = 1; row.installed_as = cmd; row.install_dir = dir; }
    });
    const markUninstalled = (id: string): void => {
      const row = rows.get(id);
      if (row) { row.installed = 0; row.installed_as = null; row.install_dir = null; }
    };
    return { rows, lookupLocal, getCatalogEntry, upsertCatalogEntry, markInstalled, markUninstalled };
  }

  it('downloads with the manifest row\'s sha256 (not a hardcoded/guessed value)', async () => {
    mockFetchManifest.mockResolvedValue({
      manifest: makeManifest([makeManifestDoor({ archiveName: 'FOO.LHA', sha256: 'deadbeef'.repeat(8) })]),
      fromCache: false,
      cachedAt: null,
    } satisfies FetchManifestResult);
    mockDownloadArchive.mockImplementation(async (_cfg, _name, destPath) => {
      fs.writeFileSync(destPath, 'archive-bytes');
    });
    const deps = baseDeps();

    const outcome = await installConsumerDoor(
      CFG, 'FOO.LHA', 'XIM', 'FOO', 'FOO', path.join(tmpDir, 'Doors', 'FOO'),
      path.join(tmpDir, 'FOO.info'), path.join(tmpDir, 'tmp-door-repo'), deps
    );

    expect(outcome.ok).toBe(true);
    expect(mockDownloadArchive).toHaveBeenCalledWith(
      CFG, 'FOO.LHA', path.join(tmpDir, 'tmp-door-repo', 'FOO.LHA'), 'deadbeef'.repeat(8)
    );
  });

  it('checksum failure surfaces the error AND leaves no temp file behind', async () => {
    mockFetchManifest.mockResolvedValue({
      manifest: makeManifest([makeManifestDoor({ archiveName: 'FOO.LHA' })]),
      fromCache: false,
      cachedAt: null,
    } satisfies FetchManifestResult);
    // Mirrors repo-client's real downloadArchive contract: on a checksum
    // mismatch it writes partial bytes, deletes them, then throws naming
    // both digests -- simulated here since downloadArchive itself is
    // mocked (its own guarantee is covered by doorman-repo-client.test.ts).
    mockDownloadArchive.mockImplementation(async (_cfg, _name, destPath) => {
      fs.writeFileSync(destPath, 'partial-bytes');
      fs.unlinkSync(destPath);
      throw new Error('DOOR REPO: CHECKSUM MISMATCH for FOO.LHA: expected sha256 aaaa, got bbbb');
    });
    const deps = baseDeps();
    const destPath = path.join(tmpDir, 'tmp-door-repo', 'FOO.LHA');

    const outcome = await installConsumerDoor(
      CFG, 'FOO.LHA', 'XIM', 'FOO', 'FOO', path.join(tmpDir, 'Doors', 'FOO'),
      path.join(tmpDir, 'FOO.info'), path.join(tmpDir, 'tmp-door-repo'), deps
    );

    expect(outcome).toEqual({ ok: false, step: 'download', detail: expect.stringContaining('CHECKSUM MISMATCH') });
    expect(fs.existsSync(destPath)).toBe(false);
    expect(deps.extractArchiveTo).not.toHaveBeenCalled();
  });

  it('extract failure AFTER a successful download still cleans up the temp file (finally runs on every path)', async () => {
    mockFetchManifest.mockResolvedValue({
      manifest: makeManifest([makeManifestDoor({ archiveName: 'FOO.LHA' })]),
      fromCache: false,
      cachedAt: null,
    } satisfies FetchManifestResult);
    mockDownloadArchive.mockImplementation(async (_cfg, _name, destPath) => {
      fs.writeFileSync(destPath, 'archive-bytes');
    });
    const deps = baseDeps({
      extractArchiveTo: jest.fn().mockResolvedValue({ ok: false, fileCount: 0, error: 'unreadable archive' }),
    });
    const destPath = path.join(tmpDir, 'tmp-door-repo', 'FOO.LHA');

    const outcome = await installConsumerDoor(
      CFG, 'FOO.LHA', 'XIM', 'FOO', 'FOO', path.join(tmpDir, 'Doors', 'FOO'),
      path.join(tmpDir, 'FOO.info'), path.join(tmpDir, 'tmp-door-repo'), deps
    );

    expect(outcome).toEqual({ ok: false, step: 'extract', detail: 'unreadable archive' });
    // The download itself succeeded -- proving this cleanup is OUR
    // finally, not downloadArchive's own on-failure safeUnlink.
    expect(fs.existsSync(destPath)).toBe(false);
  });

  it('success path passes the DOWNLOADED path (tmp-door-repo/<archiveName>) into the existing extract flow', async () => {
    mockFetchManifest.mockResolvedValue({
      manifest: makeManifest([makeManifestDoor({ archiveName: 'FOO.LHA' })]),
      fromCache: false,
      cachedAt: null,
    } satisfies FetchManifestResult);
    mockDownloadArchive.mockImplementation(async (_cfg, _name, destPath) => {
      fs.writeFileSync(destPath, 'archive-bytes');
    });
    const deps = baseDeps();
    const tmpRepoDir = path.join(tmpDir, 'tmp-door-repo');
    const installDir = path.join(tmpDir, 'Doors', 'FOO');

    const outcome = await installConsumerDoor(
      CFG, 'FOO.LHA', 'XIM', 'FOO', 'FOO', installDir, path.join(tmpDir, 'FOO.info'), tmpRepoDir, deps
    );

    expect(outcome.ok).toBe(true);
    expect(deps.extractArchiveTo).toHaveBeenCalledWith(path.join(tmpRepoDir, 'FOO.LHA'), installDir);
  });

  it('missing sha256 in the manifest row fails loudly instead of downloading unverifiable bytes', async () => {
    mockFetchManifest.mockResolvedValue({
      manifest: makeManifest([makeManifestDoor({ archiveName: 'FOO.LHA', sha256: null })]),
      fromCache: false,
      cachedAt: null,
    } satisfies FetchManifestResult);
    const deps = baseDeps();

    const outcome = await installConsumerDoor(
      CFG, 'FOO.LHA', 'XIM', 'FOO', 'FOO', path.join(tmpDir, 'Doors', 'FOO'),
      path.join(tmpDir, 'FOO.info'), path.join(tmpDir, 'tmp-door-repo'), deps
    );

    expect(outcome.ok).toBe(false);
    expect(mockDownloadArchive).not.toHaveBeenCalled();
  });

  // ── Local registration decision (fix round 1) ────────────────────────
  //
  // CatalogEntry.id falls back to archiveName for rows never indexed
  // locally (repoDataSource.ts's mapManifestDoorToEntry) -- it is not a
  // door_catalog primary key. installConsumerDoor re-resolves the local
  // row itself via lookupLocal rather than trusting a caller-supplied id.
  //
  // Ruling: on a consumer BBS, "no local row yet" is the NORMAL case for a
  // fresh install (a consumer browses the manifest precisely because it
  // has no catalog rows), so this now UPSERTs a minimal local row instead
  // of leaving the door permanently un-installed-looking. door-catalog.
  // service.ts's existing (previously unused) upsertCatalogEntry already
  // has an ON CONFLICT(id) clause that never touches installed/
  // installed_as/install_dir, so it's metadata-only by construction --
  // markInstalled (below) is what actually flips those.

  it('installed state visible afterward (already-known door): a real local catalog row -> markInstalled runs, registeredLocally true, no upsert needed', async () => {
    mockFetchManifest.mockResolvedValue({
      manifest: makeManifest([makeManifestDoor({ archiveName: 'FOO.LHA' })]),
      fromCache: false,
      cachedAt: null,
    } satisfies FetchManifestResult);
    mockDownloadArchive.mockImplementation(async (_cfg, _name, destPath) => {
      fs.writeFileSync(destPath, 'archive-bytes');
    });
    const localRow: LocalCatalogRow = {
      id: 'local-id-99', installed: 0, installed_as: null, install_dir: null,
      binary_name: null, archive_path: 'FAME/FOO.LHA',
    };
    const deps = baseDeps({ lookupLocal: jest.fn().mockReturnValue(localRow) });

    const outcome = await installConsumerDoor(
      CFG, 'FOO.LHA', 'XIM', 'FOO', 'FOO', path.join(tmpDir, 'Doors', 'FOO'),
      path.join(tmpDir, 'FOO.info'), path.join(tmpDir, 'tmp-door-repo'), deps
    );

    expect(outcome).toMatchObject({ ok: true, registeredLocally: true });
    expect(deps.markInstalled).toHaveBeenCalledWith('local-id-99', 'FOO', 'Doors/FOO');
    expect(deps.upsertCatalogEntry).not.toHaveBeenCalled();
  });

  it('no local catalog row (first-ever consumer install): upserts a minimal row from ONLY known facts, then marks it installed', async () => {
    mockFetchManifest.mockResolvedValue({
      manifest: makeManifest([makeManifestDoor({
        archiveName: 'FOO.LHA', doorType: 'FIM', name: 'Foo Door', description: 'A neat door.',
        archiveSize: 9999, author: 'Someone', releaseGroup: 'GRP', category: 'trivia', fileIdDiz: 'diz text',
      })]),
      fromCache: false,
      cachedAt: null,
    } satisfies FetchManifestResult);
    mockDownloadArchive.mockImplementation(async (_cfg, _name, destPath) => {
      fs.writeFileSync(destPath, 'archive-bytes');
    });
    const upsertCatalogEntry = jest.fn();
    const markInstalled = jest.fn();
    const deps = baseDeps({
      lookupLocal: jest.fn().mockReturnValue(null),
      getCatalogEntry: jest.fn().mockReturnValue(null),
      upsertCatalogEntry,
      markInstalled,
    });

    const outcome = await installConsumerDoor(
      CFG, 'FOO.LHA', 'FIM', null, 'FOODOOR', path.join(tmpDir, 'Doors', 'FOODOOR'),
      path.join(tmpDir, 'FOODOOR.info'), path.join(tmpDir, 'tmp-door-repo'), deps
    );

    expect(outcome).toMatchObject({ ok: true, registeredLocally: true });
    const expectedId = catalogIdForArchive('FOO.LHA');
    expect(upsertCatalogEntry).toHaveBeenCalledWith({
      id: expectedId,
      archive_name: 'FOO.LHA',
      archive_path: '', // lives on the central server, never claimed as local
      binary_name: null,
      door_type: 'FIM',
      name: 'Foo Door',
      version: null,
      author: null,
      release_group: null,
      description: 'A neat door.',
      file_id_diz: null,
      doc_filename: null,
      doc_raw: null,
      suggested_tooltypes: null,
      category: null,
      archive_size: 9999,
      junk_count: 0,
      installed: 0, // markInstalled (not this upsert) owns install state
      installed_as: null,
      install_dir: null,
      corpus_id: null,
      source: CONSUMER_INSTALL_SOURCE,
    } satisfies ConsumerCatalogUpsertRow);
    expect(markInstalled).toHaveBeenCalledWith(expectedId, 'FOODOOR', 'Doors/FOODOOR');
    // Metadata row must exist before markInstalled targets its id.
    const upsertOrder = upsertCatalogEntry.mock.invocationCallOrder[0];
    const markOrder = markInstalled.mock.invocationCallOrder[0];
    expect(upsertOrder).toBeLessThan(markOrder);
  });

  it('id-slug collision with a DIFFERENT archive_name: never clobbers the existing row, falls back to registry-only', async () => {
    const collidingId = catalogIdForArchive('FOO.LHA');
    const getCatalogEntry = jest.fn().mockReturnValue({ archive_name: 'DIFFERENT-ARCHIVE.LHA' });
    const upsertCatalogEntry = jest.fn();
    const markInstalled = jest.fn();
    mockFetchManifest.mockResolvedValue({
      manifest: makeManifest([makeManifestDoor({ archiveName: 'FOO.LHA' })]),
      fromCache: false,
      cachedAt: null,
    } satisfies FetchManifestResult);
    mockDownloadArchive.mockImplementation(async (_cfg, _name, destPath) => {
      fs.writeFileSync(destPath, 'archive-bytes');
    });
    const deps = baseDeps({
      lookupLocal: jest.fn().mockReturnValue(null), getCatalogEntry, upsertCatalogEntry, markInstalled,
    });

    const outcome = await installConsumerDoor(
      CFG, 'FOO.LHA', 'XIM', null, 'FOODOOR', path.join(tmpDir, 'Doors', 'FOODOOR'),
      path.join(tmpDir, 'FOODOOR.info'), path.join(tmpDir, 'tmp-door-repo'), deps
    );

    expect(outcome).toMatchObject({ ok: true, registeredLocally: false });
    expect(getCatalogEntry).toHaveBeenCalledWith(collidingId);
    expect(upsertCatalogEntry).not.toHaveBeenCalled();
    expect(markInstalled).not.toHaveBeenCalled();
  });

  it('ACCEPTANCE: after a first-ever consumer install, the repo browse view resolves installed=1 via lookupLocal (Task 6)', async () => {
    const store = makeFakeLocalCatalog();
    const manifestDoor = makeManifestDoor({
      archiveName: 'FOO.LHA', name: 'Foo Door', description: 'A neat door.', archiveSize: 4096,
    });
    mockFetchManifest.mockResolvedValue({
      manifest: makeManifest([manifestDoor]), fromCache: false, cachedAt: null,
    } satisfies FetchManifestResult);
    mockDownloadArchive.mockImplementation(async (_cfg, _name, destPath) => {
      fs.writeFileSync(destPath, 'archive-bytes');
    });
    const deps = baseDeps({
      lookupLocal: store.lookupLocal, getCatalogEntry: store.getCatalogEntry,
      upsertCatalogEntry: store.upsertCatalogEntry, markInstalled: store.markInstalled,
    });

    const outcome = await installConsumerDoor(
      CFG, 'FOO.LHA', 'XIM', null, 'FOODOOR', path.join(tmpDir, 'Doors', 'FOODOOR'),
      path.join(tmpDir, 'FOODOOR.info'), path.join(tmpDir, 'tmp-door-repo'), deps
    );
    expect(outcome).toMatchObject({ ok: true, registeredLocally: true });

    // The actual acceptance bar for this round: Task 6's real
    // mapManifestDoorToEntry, driven by the SAME local-state lookup the
    // repo browse view uses, now resolves this door as installed --
    // not just "upsertCatalogEntry was called".
    const browseEntry = mapManifestDoorToEntry(manifestDoor, store.lookupLocal);
    expect(browseEntry.installed).toBe(1);
    expect(browseEntry.installed_as).toBe('FOODOOR');
    expect(browseEntry.id).toBe(catalogIdForArchive('FOO.LHA'));
  });

  it('idempotent: install -> uninstall -> reinstall targets the same row, never creates a duplicate', async () => {
    const store = makeFakeLocalCatalog();
    mockFetchManifest.mockResolvedValue({
      manifest: makeManifest([makeManifestDoor({ archiveName: 'FOO.LHA' })]), fromCache: false, cachedAt: null,
    } satisfies FetchManifestResult);
    mockDownloadArchive.mockImplementation(async (_cfg, _name, destPath) => {
      fs.writeFileSync(destPath, 'archive-bytes');
    });
    const deps = baseDeps({
      lookupLocal: store.lookupLocal, getCatalogEntry: store.getCatalogEntry,
      upsertCatalogEntry: store.upsertCatalogEntry, markInstalled: store.markInstalled,
    });
    const install = () => installConsumerDoor(
      CFG, 'FOO.LHA', 'XIM', null, 'FOODOOR', path.join(tmpDir, 'Doors', 'FOODOOR'),
      path.join(tmpDir, 'FOODOOR.info'), path.join(tmpDir, 'tmp-door-repo'), deps
    );

    const first = await install();
    expect(first).toMatchObject({ ok: true, registeredLocally: true });
    expect(store.rows.size).toBe(1);
    expect(store.upsertCatalogEntry).toHaveBeenCalledTimes(1);
    const id = catalogIdForArchive('FOO.LHA');

    // Uninstall: matches RepoView's real uninstall branch -- markUninstalled
    // flips installed back to 0 but KEEPS the row (never deletes it).
    store.markUninstalled(id);
    expect(store.rows.get(id)?.installed).toBe(0);

    const second = await install();
    expect(second).toMatchObject({ ok: true, registeredLocally: true });

    // Still exactly one row: reinstall found the existing row via
    // lookupLocal and went straight to markInstalled, never upserting a
    // second (duplicate) row for the same archive.
    expect(store.rows.size).toBe(1);
    expect(store.upsertCatalogEntry).toHaveBeenCalledTimes(1);
    expect(store.markInstalled).toHaveBeenCalledTimes(2);
  });
});

// ─── catalogIdForArchive: deterministic slug, matches the corpus-builder ────
// convention (dev/scripts/door-corpus/build-door-catalog.ts's `baseId`) ────

describe('DOORMAN app.ts: catalogIdForArchive', () => {
  it('matches known seed-data conversions (same formula as the corpus builder)', () => {
    // Real rows from web/backend/seeds/door-catalog-seed.sql:
    //   ('_alster', '!ALSTER.LHA', ...)   ('5d_add12', '5D-ADD12.LHA', ...)
    expect(catalogIdForArchive('!ALSTER.LHA')).toBe('_alster');
    expect(catalogIdForArchive('5D-ADD12.LHA')).toBe('5d_add12');
  });

  it('deterministic: the same archiveName always yields the same id (install/uninstall/reinstall idempotency depends on this)', () => {
    expect(catalogIdForArchive('FOO.LHA')).toBe(catalogIdForArchive('FOO.LHA'));
    expect(catalogIdForArchive('foo.lha')).toBe(catalogIdForArchive('FOO.LHA'));
  });
});
