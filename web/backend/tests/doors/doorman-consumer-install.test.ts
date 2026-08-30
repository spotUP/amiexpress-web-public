/**
 * Task 7 (extended by Task 5): consumer-mode install-from-download.
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
 * Task 5 moved install-state persistence off door_catalog (upsertCatalogEntry
 * / markInstalled, a fake local catalog row synthesized purely to give
 * markInstalled something to write to) onto door_installs (recordInstall) --
 * the standalone table that survives the catalog itself moving to the
 * external door server. This suite was rewritten alongside that change: it
 * now drives `recordInstall`/`getInstallByCommand` instead of the retired
 * `upsertCatalogEntry`/`getCatalogEntry`/`markInstalled` trio.
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
  fetchDoorDetail: jest.fn(),
}));

import {
  extractAndRegisterDoor,
  installConsumerDoor,
  commandClaimedByOtherArchive,
  type InstallDeps,
  type ConsumerInstallDeps,
  type DoorInstallEntry,
} from '../../../../Doors/door-manager/app';
import { downloadArchive, fetchManifest } from '../../../../Doors/door-manager/repo-client';
import type { DoorRepoManifest, ManifestDoor } from '../../../../Doors/door-manager/repo-types.generated';
import type { RepoClientConfig, FetchManifestResult } from '../../../../Doors/door-manager/repo-client';
import { mapManifestDoorToEntry } from '../../../../Doors/door-manager/repoDataSource';
import type { LocalCatalogRow, LocalCatalogLookup, InstallLookup } from '../../../../Doors/door-manager/repoDataSource';

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
    junkCount: 0,
    hasDoc: false,
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

// ─── commandClaimedByOtherArchive: the shared command-collision guard ───────
//
// Review finding (commit 6bc3b54cc): the original fix wired this guard into
// installConsumerDoor's recordInstall closure but left owner-mode's install
// call site (doInstallUninstall, RepoView -- not exported, requires a live
// blessed Screen, so not unit-testable directly) calling recordInstallSafe
// unconditionally. Since door_installs.recordInstall upserts ON
// CONFLICT(command), an owner-mode install of a DIFFERENT archive under a
// command another archive's install already owns would silently steal that
// row. Fixed by extracting the guard into this one shared, exported,
// directly-testable function and wiring it into BOTH install call sites.

describe('DOORMAN app.ts: commandClaimedByOtherArchive (shared collision guard)', () => {
  it('no existing install under this command -> false, no log', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const getInstallByCommand = jest.fn().mockReturnValue(null);
    expect(commandClaimedByOtherArchive(getInstallByCommand, 'FOODOOR', 'FOO.LHA')).toBe(false);
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('existing install under this command is the SAME archive (reinstall) -> false, no log', () => {
    const getInstallByCommand = jest.fn().mockReturnValue({ archive_name: 'FOO.LHA' });
    expect(commandClaimedByOtherArchive(getInstallByCommand, 'FOODOOR', 'FOO.LHA')).toBe(false);
  });

  it('existing install under this command is a DIFFERENT archive -> true, logs the refusal', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const getInstallByCommand = jest.fn().mockReturnValue({ archive_name: 'OTHER.LHA' });
    expect(commandClaimedByOtherArchive(getInstallByCommand, 'FOODOOR', 'FOO.LHA')).toBe(true);
    expect(getInstallByCommand).toHaveBeenCalledWith('FOODOOR');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('OTHER.LHA'));
    logSpy.mockRestore();
  });
});

// ─── extractAndRegisterDoor: the shared owner/consumer install core ─────────

describe('DOORMAN app.ts: extractAndRegisterDoor (shared install core)', () => {
  function baseDeps(overrides: Partial<InstallDeps> = {}): InstallDeps {
    return {
      extractArchiveTo: jest.fn().mockResolvedValue({ ok: true, fileCount: 3 }),
      findExtractedBinary: jest.fn().mockReturnValue('BIN'),
      writeInfoFile: jest.fn(),
      recordInstall: jest.fn(),
      refreshDoorRegistry: jest.fn().mockResolvedValue(true),
      ...overrides,
    };
  }

  it('extract failure surfaces step "extract" and skips write-info/recordInstall', async () => {
    const deps = baseDeps({
      extractArchiveTo: jest.fn().mockResolvedValue({ ok: false, fileCount: 0, error: 'bad archive' }),
    });
    const outcome = await extractAndRegisterDoor(
      '/archives/FOO.LHA', '/doors/FOO', '/cmd/FOO.info', 'XIM', 'FOO', 'FOO', deps
    );
    expect(outcome).toMatchObject({ ok: false, step: 'extract', detail: 'bad archive' });
    // The install reports what it did for the sysop's panel; a failed
    // extract says so and stops there.
    expect(outcome.steps.map(s => s.kind)).toEqual(['fail']);
    expect(deps.writeInfoFile).not.toHaveBeenCalled();
    expect(deps.recordInstall).not.toHaveBeenCalled();
  });

  it('success: calls extractArchiveTo with the given archivePath, writes info, records the install, refreshes registry', async () => {
    const deps = baseDeps();
    const outcome = await extractAndRegisterDoor(
      '/archives/FOO.LHA', '/doors/FOO', '/cmd/FOO.info', 'FIM', 'FOO', 'FOO', deps
    );
    expect(deps.extractArchiveTo).toHaveBeenCalledWith('/archives/FOO.LHA', '/doors/FOO');
    expect(deps.writeInfoFile).toHaveBeenCalledWith('/cmd/FOO.info', expect.stringContaining('TYPE=FIM'));
    expect(deps.recordInstall).toHaveBeenCalledTimes(1);
    expect(deps.refreshDoorRegistry).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ ok: true, doorType: 'FIM', fileCount: 3, binaryRel: 'BIN' });
    // Every step the panel shows the sysop, in the order they happened.
    expect(outcome.steps.map(s => s.kind)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
  });

  it('a recordInstall that throws does not fail the install -- the door is already on disk and working', async () => {
    const deps = baseDeps({
      recordInstall: jest.fn(() => { throw new Error('db locked'); }),
    });
    const outcome = await extractAndRegisterDoor(
      '/archives/FOO.LHA', '/doors/FOO', '/cmd/FOO.info', 'XIM', 'FOO', 'FOO', deps
    );
    expect(outcome.ok).toBe(true);
    expect(deps.refreshDoorRegistry).toHaveBeenCalledTimes(1);
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
      getInstallByCommand: jest.fn().mockReturnValue(null),
      recordInstall: jest.fn(),
      refreshDoorRegistry: jest.fn().mockResolvedValue(true),
      mkdir: (dir: string) => fs.mkdirSync(dir, { recursive: true }),
      unlink: (p: string) => { try { fs.unlinkSync(p); } catch { /* already gone */ } },
      ...overrides,
    };
  }

  // ── Fake door_installs, in-memory ────────────────────────────────────
  //
  // Backs lookupLocal/getInstallByCommand/recordInstall with ONE shared
  // Map keyed by command (door_installs' real uniqueness column, via its
  // ON CONFLICT(command) upsert), so tests can drive installConsumerDoor
  // and then check the resulting local state through the exact same read
  // path RepoView's real browse view uses (repoDataSource.ts's
  // mapManifestDoorToEntry) -- not just assert "recordInstall was called".
  function makeFakeInstallsStore() {
    const rows = new Map<string, DoorInstallEntry>(); // keyed by command
    const lookupLocal: LocalCatalogLookup = (): LocalCatalogRow | null => null; // no door_catalog row in these scenarios
    const getInstallByCommand = jest.fn((command: string): { archive_name: string } | null => {
      const row = rows.get(command);
      return row ? { archive_name: row.archive_name } : null;
    });
    const recordInstall = jest.fn((entry: DoorInstallEntry) => {
      rows.set(entry.command, entry);
    });
    const removeInstall = (command: string): void => { rows.delete(command); };
    const lookupInstall: InstallLookup = (archiveName: string) => {
      for (const row of rows.values()) {
        if (row.archive_name === archiveName) return { command: row.command, install_dir: row.install_dir };
      }
      return null;
    };
    return { rows, lookupLocal, getInstallByCommand, recordInstall, removeInstall, lookupInstall };
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

    expect(outcome).toMatchObject({ ok: false, step: 'extract', detail: 'unreadable archive' });
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

  // ── Local registration (Task 5: door_installs, not door_catalog) ────────

  it('records the install in door_installs with catalog_id from a real local door_catalog row when one exists', async () => {
    mockFetchManifest.mockResolvedValue({
      manifest: makeManifest([makeManifestDoor({
        archiveName: 'FOO.LHA', doorType: 'FIM', name: 'Foo Door', description: 'A neat door.',
        category: 'trivia', releaseGroup: 'GRP',
      })]),
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
    const recordInstall = jest.fn();
    const deps = baseDeps({ lookupLocal: jest.fn().mockReturnValue(localRow), recordInstall });

    const outcome = await installConsumerDoor(
      CFG, 'FOO.LHA', 'FIM', null, 'FOODOOR', path.join(tmpDir, 'Doors', 'FOODOOR'),
      path.join(tmpDir, 'FOODOOR.info'), path.join(tmpDir, 'tmp-door-repo'), deps
    );

    expect(outcome).toMatchObject({ ok: true, registeredLocally: true });
    expect(recordInstall).toHaveBeenCalledWith({
      id: 'install-FOODOOR',
      catalog_id: 'local-id-99',
      archive_name: 'FOO.LHA',
      command: 'FOODOOR',
      install_dir: 'Doors/FOODOOR',
      door_type: 'FIM',
      name: 'Foo Door',
      md5: null,
      description: 'A neat door.',
      category: 'trivia',
      version: null,
      release_group: 'GRP',
      source_url: CFG.url,
      // The revision the manifest this install actually resolved against
      // was stamped with -- it was already in hand and recorded as null.
      source_revision: 'rev1',
    } satisfies DoorInstallEntry);
  });

  // ── What the record actually knows (item 7) ────────────────────────────
  //
  // Three fields were written as null with the data already in hand: md5
  // and the manifest revision were both sitting in the manifest this very
  // install resolved against, and version is the one field only
  // GET /doors/:archiveName carries.

  it('records the version from the detail endpoint and the md5/revision the manifest already carried', async () => {
    mockFetchManifest.mockResolvedValue({
      manifest: makeManifest([makeManifestDoor({ archiveName: 'FOO.LHA', md5: 'abc123' })]),
      fromCache: false,
      cachedAt: null,
    } satisfies FetchManifestResult);
    mockDownloadArchive.mockImplementation(async (_cfg, _name, destPath) => {
      fs.writeFileSync(destPath, 'archive-bytes');
    });
    const recordInstall = jest.fn();
    const fetchDoorDetail = jest.fn().mockResolvedValue({ archiveName: 'FOO.LHA', version: 'v2.1' });
    const deps = baseDeps({ recordInstall, fetchDoorDetail });

    const outcome = await installConsumerDoor(
      CFG, 'FOO.LHA', 'XIM', 'FOO', 'FOODOOR', path.join(tmpDir, 'Doors', 'FOODOOR'),
      path.join(tmpDir, 'FOODOOR.info'), path.join(tmpDir, 'tmp-door-repo'), deps
    );

    expect(outcome.ok).toBe(true);
    expect(fetchDoorDetail).toHaveBeenCalledWith(CFG, 'FOO.LHA');
    expect(recordInstall).toHaveBeenCalledWith(expect.objectContaining({
      version: 'v2.1',
      md5: 'abc123',
      source_revision: 'rev1',
    }));
  });

  it('a failing detail fetch costs the record its version, never the install', async () => {
    mockFetchManifest.mockResolvedValue({
      manifest: makeManifest([makeManifestDoor({ archiveName: 'FOO.LHA' })]),
      fromCache: false,
      cachedAt: null,
    } satisfies FetchManifestResult);
    mockDownloadArchive.mockImplementation(async (_cfg, _name, destPath) => {
      fs.writeFileSync(destPath, 'archive-bytes');
    });
    const recordInstall = jest.fn();
    const deps = baseDeps({
      recordInstall,
      fetchDoorDetail: jest.fn().mockRejectedValue(new Error('door server down')),
    });

    const outcome = await installConsumerDoor(
      CFG, 'FOO.LHA', 'XIM', 'FOO', 'FOODOOR', path.join(tmpDir, 'Doors', 'FOODOOR'),
      path.join(tmpDir, 'FOODOOR.info'), path.join(tmpDir, 'tmp-door-repo'), deps
    );

    expect(outcome.ok).toBe(true);
    expect(recordInstall).toHaveBeenCalledWith(expect.objectContaining({ version: null }));
  });

  it('no local door_catalog row (the normal case for a fresh consumer install): records with catalog_id null, still registeredLocally', async () => {
    mockFetchManifest.mockResolvedValue({
      manifest: makeManifest([makeManifestDoor({ archiveName: 'FOO.LHA' })]),
      fromCache: false,
      cachedAt: null,
    } satisfies FetchManifestResult);
    mockDownloadArchive.mockImplementation(async (_cfg, _name, destPath) => {
      fs.writeFileSync(destPath, 'archive-bytes');
    });
    const recordInstall = jest.fn();
    const deps = baseDeps({ lookupLocal: jest.fn().mockReturnValue(null), recordInstall });

    const outcome = await installConsumerDoor(
      CFG, 'FOO.LHA', 'XIM', null, 'FOODOOR', path.join(tmpDir, 'Doors', 'FOODOOR'),
      path.join(tmpDir, 'FOODOOR.info'), path.join(tmpDir, 'tmp-door-repo'), deps
    );

    expect(outcome).toMatchObject({ ok: true, registeredLocally: true });
    expect(recordInstall).toHaveBeenCalledWith(expect.objectContaining({
      catalog_id: null,
      command: 'FOODOOR',
      archive_name: 'FOO.LHA',
    }));
  });

  it('command collision with a DIFFERENT archive: never clobbers the existing install, falls back to registry-only (extraction/registry-refresh still happen)', async () => {
    const getInstallByCommand = jest.fn().mockReturnValue({ archive_name: 'DIFFERENT-ARCHIVE.LHA' });
    const recordInstall = jest.fn();
    mockFetchManifest.mockResolvedValue({
      manifest: makeManifest([makeManifestDoor({ archiveName: 'FOO.LHA' })]),
      fromCache: false,
      cachedAt: null,
    } satisfies FetchManifestResult);
    mockDownloadArchive.mockImplementation(async (_cfg, _name, destPath) => {
      fs.writeFileSync(destPath, 'archive-bytes');
    });
    const deps = baseDeps({
      lookupLocal: jest.fn().mockReturnValue(null), getInstallByCommand, recordInstall,
    });

    const outcome = await installConsumerDoor(
      CFG, 'FOO.LHA', 'XIM', null, 'FOODOOR', path.join(tmpDir, 'Doors', 'FOODOOR'),
      path.join(tmpDir, 'FOODOOR.info'), path.join(tmpDir, 'tmp-door-repo'), deps
    );

    expect(outcome).toMatchObject({ ok: true, registeredLocally: false });
    expect(getInstallByCommand).toHaveBeenCalledWith('FOODOOR');
    expect(recordInstall).not.toHaveBeenCalled();
    // Extraction and registry refresh still ran -- a command collision only
    // blocks local bookkeeping, never the on-disk install itself.
    expect(deps.extractArchiveTo).toHaveBeenCalled();
    expect(deps.refreshDoorRegistry).toHaveBeenCalled();
  });

  it('ACCEPTANCE: after a first-ever consumer install, the repo browse view resolves installed=1 via door_installs (not door_catalog)', async () => {
    const store = makeFakeInstallsStore();
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
      lookupLocal: store.lookupLocal, getInstallByCommand: store.getInstallByCommand,
      recordInstall: store.recordInstall,
    });

    const outcome = await installConsumerDoor(
      CFG, 'FOO.LHA', 'XIM', null, 'FOODOOR', path.join(tmpDir, 'Doors', 'FOODOOR'),
      path.join(tmpDir, 'FOODOOR.info'), path.join(tmpDir, 'tmp-door-repo'), deps
    );
    expect(outcome).toMatchObject({ ok: true, registeredLocally: true });

    // The actual acceptance bar: Task 6's real mapManifestDoorToEntry,
    // driven by the SAME door_installs-backed lookup the repo browse view
    // uses, now resolves this door as installed -- not just "recordInstall
    // was called".
    const browseEntry = mapManifestDoorToEntry(manifestDoor, store.lookupLocal, store.lookupInstall);
    expect(browseEntry.installed).toBe(1);
    expect(browseEntry.installed_as).toBe('FOODOOR');
    expect(browseEntry.install_dir).toBe('Doors/FOODOOR');
  });

  it('idempotent: install -> uninstall -> reinstall of the same command never creates a duplicate row (door_installs upserts ON CONFLICT(command))', async () => {
    const store = makeFakeInstallsStore();
    mockFetchManifest.mockResolvedValue({
      manifest: makeManifest([makeManifestDoor({ archiveName: 'FOO.LHA' })]), fromCache: false, cachedAt: null,
    } satisfies FetchManifestResult);
    mockDownloadArchive.mockImplementation(async (_cfg, _name, destPath) => {
      fs.writeFileSync(destPath, 'archive-bytes');
    });
    const deps = baseDeps({
      lookupLocal: store.lookupLocal, getInstallByCommand: store.getInstallByCommand,
      recordInstall: store.recordInstall,
    });
    const install = () => installConsumerDoor(
      CFG, 'FOO.LHA', 'XIM', null, 'FOODOOR', path.join(tmpDir, 'Doors', 'FOODOOR'),
      path.join(tmpDir, 'FOODOOR.info'), path.join(tmpDir, 'tmp-door-repo'), deps
    );

    const first = await install();
    expect(first).toMatchObject({ ok: true, registeredLocally: true });
    expect(store.rows.size).toBe(1);

    // Uninstall: matches RepoView's real uninstall branch -- removeInstall
    // deletes the door_installs row outright (unlike the old door_catalog
    // markUninstalled, which kept the row and only flipped a flag).
    store.removeInstall('FOODOOR');
    expect(store.rows.size).toBe(0);

    const second = await install();
    expect(second).toMatchObject({ ok: true, registeredLocally: true });

    // Still exactly one row: reinstall recorded against the same command,
    // never leaving a stray duplicate behind.
    expect(store.rows.size).toBe(1);
    expect(store.recordInstall).toHaveBeenCalledTimes(2);
  });
});
