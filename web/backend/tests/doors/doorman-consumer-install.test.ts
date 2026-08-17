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
  type InstallDeps,
  type ConsumerInstallDeps,
} from '../../../../Doors/door-manager/app';
import { downloadArchive, fetchManifest } from '../../../../Doors/door-manager/repo-client';
import type { DoorRepoManifest, ManifestDoor } from '../../../../Doors/door-manager/repo-types.generated';
import type { RepoClientConfig, FetchManifestResult } from '../../../../Doors/door-manager/repo-client';
import type { LocalCatalogRow } from '../../../../Doors/door-manager/repoDataSource';

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
      markInstalled: jest.fn(),
      refreshDoorRegistry: jest.fn().mockResolvedValue(true),
      mkdir: (dir: string) => fs.mkdirSync(dir, { recursive: true }),
      unlink: (p: string) => { try { fs.unlinkSync(p); } catch { /* already gone */ } },
      ...overrides,
    };
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

  // ── Local registration decision ──────────────────────────────────────
  //
  // CatalogEntry.id falls back to archiveName for rows never indexed
  // locally (repoDataSource.ts's mapManifestDoorToEntry) -- it is not a
  // door_catalog primary key. installConsumerDoor re-resolves the local
  // row itself via lookupLocal rather than trusting a caller-supplied id.

  it('installed state visible afterward: a real local catalog row -> markInstalled runs, registeredLocally true', async () => {
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
  });

  it('no local catalog row: markInstalled is skipped (never invents a row), install still succeeds registry-only', async () => {
    mockFetchManifest.mockResolvedValue({
      manifest: makeManifest([makeManifestDoor({ archiveName: 'FOO.LHA' })]),
      fromCache: false,
      cachedAt: null,
    } satisfies FetchManifestResult);
    mockDownloadArchive.mockImplementation(async (_cfg, _name, destPath) => {
      fs.writeFileSync(destPath, 'archive-bytes');
    });
    const deps = baseDeps({ lookupLocal: jest.fn().mockReturnValue(null) });

    const outcome = await installConsumerDoor(
      CFG, 'FOO.LHA', 'XIM', 'FOO', 'FOO', path.join(tmpDir, 'Doors', 'FOO'),
      path.join(tmpDir, 'FOO.info'), path.join(tmpDir, 'tmp-door-repo'), deps
    );

    expect(outcome).toMatchObject({ ok: true, registeredLocally: false });
    expect(deps.markInstalled).not.toHaveBeenCalled();
    // The rest of the install (on-disk extract + .info + registry refresh)
    // still ran -- registry-only tracking means the door works, only the
    // repo browse view's `installed` flag won't reflect it.
    expect(deps.writeInfoFile).toHaveBeenCalled();
    expect(deps.refreshDoorRegistry).toHaveBeenCalled();
  });
});
