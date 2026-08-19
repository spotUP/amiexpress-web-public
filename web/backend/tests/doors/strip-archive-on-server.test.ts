/**
 * Stripping ads out of a REPOSITORY archive, in place.
 *
 * Distinct from DOORMAN's existing strip, which edits an installed door's
 * directory and leaves the published archive alone. Here the published bytes
 * change, so the catalog must be re-described: size, md5, sha256 and the
 * per-file rows all derive from the file and would otherwise describe an
 * archive that no longer exists - handing clients a digest that cannot match
 * what they download.
 *
 * The end-to-end case uses the real `lha` binary and a real archive, and
 * skips itself where no archiver is installed (CI runners), because the
 * point of that case is precisely that the tool does what we believe.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import Database from 'better-sqlite3';

import {
  canDeleteMembers,
  deleteMembers,
  findLhaBinary,
} from '../../src/doors/lha-member-delete';

describe('lha-member-delete: what can be edited in place', () => {
  it('accepts .lha and .lzh', () => {
    expect(canDeleteMembers('/x/FOO.LHA', '/usr/bin/lha').ok).toBe(true);
    expect(canDeleteMembers('/x/foo.lzh', '/usr/bin/lha').ok).toBe(true);
  });

  it('refuses LZX with the real reason, not a tooling excuse', () => {
    // 328 of the 3301 catalog archives are LZX. The obstacle is permanent -
    // this project has an LZX reader and no writer - so the message must say
    // that rather than blame a missing binary.
    const cap = canDeleteMembers('/x/FOO.LZX', '/usr/bin/lha');
    expect(cap.ok).toBe(false);
    expect(cap.reason).toMatch(/LZX/);
    expect(cap.reason).toMatch(/no LZX writer/i);
  });

  it('refuses when no archiver is installed', () => {
    const cap = canDeleteMembers('/x/FOO.LHA', null);
    expect(cap.ok).toBe(false);
    expect(cap.reason).toMatch(/no lha binary/i);
  });

  it('passes members as argv, never through a shell', () => {
    // Real catalog names contain '$', '&' and '!'. If these ever reached a
    // shell the repository would be one filename away from arbitrary
    // execution on the server.
    const calls: Array<{ bin: string; args: string[] }> = [];
    const result = deleteMembers('/x/FOO.LHA', ['ads/$BBS & AD!.txt'], {
      binary: '/usr/bin/lha',
      runner: (bin, args) => { calls.push({ bin, args }); return { status: 0, stderr: '' }; },
    });

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(['d', '/x/FOO.LHA', 'ads/$BBS & AD!.txt']);
  });

  it('removes every member in ONE invocation', () => {
    // lha rewrites the whole archive per call; N calls would rewrite it N
    // times and widen the window where a crash leaves it half-written.
    const calls: string[][] = [];
    deleteMembers('/x/FOO.LHA', ['a.txt', 'b.txt', 'c.txt'], {
      binary: '/usr/bin/lha',
      runner: (_bin, args) => { calls.push(args); return { status: 0, stderr: '' }; },
    });
    expect(calls).toHaveLength(1);
  });

  it('reports a failing archiver instead of claiming success', () => {
    const result = deleteMembers('/x/FOO.LHA', ['a.txt'], {
      binary: '/usr/bin/lha',
      runner: () => ({ status: 2, stderr: 'LHa: cannot open archive' }),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/exited 2/);
    expect(result.reason).toMatch(/cannot open archive/);
  });

  it('treats an empty selection as a no-op success', () => {
    expect(deleteMembers('/x/FOO.LHA', [], { binary: '/usr/bin/lha' })).toEqual({ ok: true, removed: 0 });
  });
});

const LHA = findLhaBinary();
const describeWithLha = LHA ? describe : describe.skip;

describeWithLha('stripArchiveOnServer: end to end against a real archive', () => {
  let tmpDir: string;
  let archiveDir: string;
  let dbPath: string;
  let archivePath: string;
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strip-archive-'));
    archiveDir = path.join(tmpDir, 'Archives', 'AmiExpress');
    fs.mkdirSync(archiveDir, { recursive: true });
    dbPath = path.join(tmpDir, 'test.sqlite');
    process.env.DOOR_ARCHIVES_ROOT = path.join(tmpDir, 'Archives');
    process.env.DATABASE_DIR = tmpDir;
    process.env.DATABASE_FILE = 'test.sqlite';

    // Build a real .lha containing one keeper and one ad.
    const staging = path.join(tmpDir, 'staging');
    fs.mkdirSync(staging);
    fs.writeFileSync(path.join(staging, 'DOOR'), 'the actual door program');
    fs.writeFileSync(path.join(staging, 'BBSAD.TXT'), 'call my board!!!');
    archivePath = path.join(archiveDir, 'REAL.LHA');
    execFileSync(LHA as string, ['a', archivePath, 'DOOR', 'BBSAD.TXT'], { cwd: staging });

    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE door_catalog (
        id TEXT PRIMARY KEY, archive_name TEXT NOT NULL UNIQUE, archive_path TEXT NOT NULL,
        binary_name TEXT, door_type TEXT DEFAULT 'XIM', name TEXT NOT NULL, version TEXT,
        author TEXT, release_group TEXT, description TEXT, file_id_diz TEXT,
        doc_filename TEXT, doc_raw TEXT, suggested_tooltypes TEXT, category TEXT,
        archive_size INTEGER DEFAULT 0, junk_count INTEGER DEFAULT 0,
        installed INTEGER DEFAULT 0, installed_as TEXT, install_dir TEXT,
        corpus_id TEXT, source TEXT DEFAULT 'scan',
        indexed_at INTEGER DEFAULT 1, md5 TEXT, sha256 TEXT
      );
      CREATE TABLE door_catalog_files (
        catalog_id TEXT NOT NULL, path TEXT NOT NULL, size INTEGER DEFAULT 0,
        is_junk INTEGER DEFAULT 0, junk_reason TEXT, PRIMARY KEY (catalog_id, path)
      );
    `);
    db.prepare(
      `INSERT INTO door_catalog (id, archive_name, archive_path, name, archive_size, junk_count, md5, sha256, indexed_at)
       VALUES ('id-real', 'REAL.LHA', 'AmiExpress/REAL.LHA', 'Real Door', ?, 1, 'stale-md5', 'stale-sha', 1)`
    ).run(fs.statSync(archivePath).size);
    const ins = db.prepare('INSERT INTO door_catalog_files (catalog_id, path, size, is_junk) VALUES (?,?,?,?)');
    ins.run('id-real', 'DOOR', 23, 0);
    ins.run('id-real', 'BBSAD.TXT', 16, 1);
    db.close();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  function svc() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../src/doors/door-catalog.service');
  }

  function listMembers(): string[] {
    return execFileSync(LHA as string, ['l', archivePath], { encoding: 'utf8' })
      .split('\n')
      .filter(l => /DOOR|BBSAD/.test(l))
      .map(l => l.trim());
  }

  it('removes the ad from the archive and leaves the door in it', () => {
    const before = fs.statSync(archivePath).size;
    const result = svc().stripArchiveOnServer('id-real', ['BBSAD.TXT']);

    expect(result.ok).toBe(true);
    expect(result.removed).toBe(1);
    expect(listMembers().join(' ')).toContain('DOOR');
    expect(listMembers().join(' ')).not.toContain('BBSAD');
    expect(fs.statSync(archivePath).size).toBeLessThan(before);
  });

  it('re-describes the catalog row so no client gets a digest for bytes that are gone', () => {
    svc().stripArchiveOnServer('id-real', ['BBSAD.TXT']);

    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare('SELECT archive_size, md5, sha256, junk_count FROM door_catalog WHERE id = ?')
      .get('id-real') as { archive_size: number; md5: string; sha256: string; junk_count: number };
    const files = db.prepare('SELECT path FROM door_catalog_files WHERE catalog_id = ?')
      .all('id-real') as Array<{ path: string }>;
    db.close();

    expect(row.md5).not.toBe('stale-md5');
    expect(row.sha256).not.toBe('stale-sha');
    expect(row.md5).toHaveLength(32);
    expect(row.sha256).toHaveLength(64);
    expect(row.archive_size).toBe(fs.statSync(archivePath).size);
    expect(row.junk_count).toBe(0);
    expect(files.map(f => f.path)).toEqual(['DOOR']);
  });

  it('changes the catalog revision, so cached catalogs are not served for the old archive', () => {
    // Size and digests alone do not move the revision (row count + newest
    // indexed_at), so indexed_at is bumped deliberately.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const manifest = require('../../src/doors/door-repo-manifest');
    const before = manifest.getCatalogRevision();
    svc().stripArchiveOnServer('id-real', ['BBSAD.TXT']);
    expect(manifest.getCatalogRevision()).not.toBe(before);
  });

  it('refuses an archive that is not on this server', () => {
    fs.unlinkSync(archivePath);
    const result = svc().stripArchiveOnServer('id-real', ['BBSAD.TXT']);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not present/i);
  });
});
