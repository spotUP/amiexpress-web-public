/**
 * Regression tests for door-catalog.service.ts's archive_path resolution.
 *
 * door_catalog.archive_path used to be a full machine-specific absolute
 * path (e.g. "~/Code/amiexpress_doors/Archives/FAME/foo.lha"),
 * which made a catalog built on a dev checkout meaningless on the live
 * server (and vice versa) — DOORMAN's "Archive not on server" check would
 * always fail there. resolveArchivePath()/resolveArchiveRoot() are the
 * single source of truth for turning a stored path into a real path on
 * whichever machine is running.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('door-catalog.service: resolveArchiveRoot', () => {
  let tmpRoot: string;
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-archive-root-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  it('prefers DOOR_ARCHIVES_ROOT when set, even if it does not exist yet', () => {
    process.env.DOOR_ARCHIVES_ROOT = '/does/not/exist/Archives';
    delete process.env.BBS_DATA_DIR;
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const svc = require('../../src/doors/door-catalog.service');
    expect(svc.resolveArchiveRoot()).toBe('/does/not/exist/Archives');
  });

  it('falls back to $BBS_DATA_DIR/Archives when it exists on disk and no env override is set', () => {
    delete process.env.DOOR_ARCHIVES_ROOT;
    const archivesDir = path.join(tmpRoot, 'Archives');
    fs.mkdirSync(archivesDir);
    process.env.BBS_DATA_DIR = tmpRoot;
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const svc = require('../../src/doors/door-catalog.service');
    expect(svc.resolveArchiveRoot()).toBe(archivesDir);
  });

  it('falls back to the dev default when neither env override nor the server volume path exists', () => {
    delete process.env.DOOR_ARCHIVES_ROOT;
    process.env.BBS_DATA_DIR = path.join(tmpRoot, 'nonexistent-bbs-data');
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const svc = require('../../src/doors/door-catalog.service');
    expect(svc.resolveArchiveRoot()).toBe('~/Code/amiexpress_doors/Archives');
  });
});

describe('door-catalog.service: resolveArchivePath', () => {
  let tmpRoot: string;
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-archive-path-'));
    process.env.DOOR_ARCHIVES_ROOT = tmpRoot;
    jest.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  function svc() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../src/doors/door-catalog.service');
  }

  it('resolves a relative archive_path against the configured root', () => {
    fs.mkdirSync(path.join(tmpRoot, 'FAME'));
    fs.writeFileSync(path.join(tmpRoot, 'FAME', 'foo.lha'), 'x');
    const resolved = svc().resolveArchivePath('FAME/foo.lha');
    expect(resolved).toBe(path.join(tmpRoot, 'FAME', 'foo.lha'));
    expect(fs.existsSync(resolved)).toBe(true);
  });

  it('returns an existing absolute path unchanged (un-migrated row still works on its own machine)', () => {
    const absDir = fs.mkdtempSync(path.join(os.tmpdir(), 'other-archives-'));
    fs.writeFileSync(path.join(absDir, 'bar.lha'), 'x');
    try {
      const abs = path.join(absDir, 'bar.lha');
      expect(svc().resolveArchivePath(abs)).toBe(abs);
    } finally {
      fs.rmSync(absDir, { recursive: true, force: true });
    }
  });

  it('re-relativizes a stale absolute path from a DIFFERENT machine (falls through /Archives/ marker)', () => {
    fs.mkdirSync(path.join(tmpRoot, 'AmiExpress'));
    fs.writeFileSync(path.join(tmpRoot, 'AmiExpress', 'old.lha'), 'x');
    const staleFromOtherMachine = '/some/other/machine/Archives/AmiExpress/old.lha';
    const resolved = svc().resolveArchivePath(staleFromOtherMachine);
    expect(resolved).toBe(path.join(tmpRoot, 'AmiExpress', 'old.lha'));
    expect(fs.existsSync(resolved)).toBe(true);
  });

  it('passes empty/falsy input through unchanged', () => {
    expect(svc().resolveArchivePath('')).toBe('');
  });
});
