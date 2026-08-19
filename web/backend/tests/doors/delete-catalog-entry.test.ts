/**
 * Deleting a door from the repo: removes the catalog rows AND the archive
 * file, so the door cannot be downloaded again and cannot come back.
 *
 * The ordering matters more than it looks. The indexer
 * (dev/scripts/door-corpus/build-door-catalog.ts) walks the archive
 * directories and upserts whatever it finds, and it has no prune step. So
 * if the rows were removed first and the unlink then failed, the next
 * re-index would RESURRECT the door that was just deleted - a silent undo
 * of a deliberate, irreversible action. Deleting the file first inverts
 * that failure into a visible, harmless one: a row whose archive is
 * missing, which /archive already answers with a 404 by design.
 *
 * Deletion is deliberately uniform: it does not consult or care about
 * `installed`. A door installed on this BBS keeps running (its files and
 * BBS command are never touched); the repo simply forgets it.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';

describe('door-catalog.service: deleteCatalogEntry', () => {
  let tmpDir: string;
  let archiveDir: string;
  let dbPath: string;
  const ORIGINAL_ENV = { ...process.env };

  function seed(opts?: { installed?: boolean; withFile?: boolean }): string {
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS door_catalog (
        id TEXT PRIMARY KEY, archive_name TEXT NOT NULL UNIQUE, archive_path TEXT NOT NULL,
        binary_name TEXT, door_type TEXT DEFAULT 'XIM', name TEXT NOT NULL, version TEXT,
        author TEXT, release_group TEXT, description TEXT, file_id_diz TEXT,
        doc_filename TEXT, doc_raw TEXT, suggested_tooltypes TEXT, category TEXT,
        archive_size INTEGER DEFAULT 0, junk_count INTEGER DEFAULT 0,
        installed INTEGER DEFAULT 0, installed_as TEXT, install_dir TEXT,
        corpus_id TEXT, source TEXT DEFAULT 'scan',
        indexed_at INTEGER DEFAULT (strftime('%s','now')), md5 TEXT, sha256 TEXT
      );
      CREATE TABLE IF NOT EXISTS door_catalog_files (
        catalog_id TEXT NOT NULL, path TEXT NOT NULL, size INTEGER DEFAULT 0,
        is_junk INTEGER DEFAULT 0, junk_reason TEXT, PRIMARY KEY (catalog_id, path)
      );
    `);
    db.prepare(
      `INSERT INTO door_catalog (id, archive_name, archive_path, name, archive_size, installed, installed_as, install_dir)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('id-doomed', 'DOOMED.LHA', 'AmiExpress/DOOMED.LHA', 'Doomed Door', 4,
          opts?.installed ? 1 : 0, opts?.installed ? 'DOOMED' : null,
          opts?.installed ? 'Doors/DOOMED' : null);
    const insFile = db.prepare(
      'INSERT INTO door_catalog_files (catalog_id, path, size, is_junk) VALUES (?, ?, ?, ?)'
    );
    insFile.run('id-doomed', 'doomed/DOOMED', 4, 0);
    insFile.run('id-doomed', 'doomed/BBSAD.TXT', 2, 1);

    // A second door that must survive untouched.
    db.prepare(
      `INSERT INTO door_catalog (id, archive_name, archive_path, name, archive_size)
       VALUES (?, ?, ?, ?, ?)`
    ).run('id-keeper', 'KEEPER.LHA', 'AmiExpress/KEEPER.LHA', 'Keeper', 4);
    insFile.run('id-keeper', 'keeper/KEEPER', 4, 0);
    db.close();

    const doomedPath = path.join(archiveDir, 'AmiExpress', 'DOOMED.LHA');
    fs.mkdirSync(path.dirname(doomedPath), { recursive: true });
    if (opts?.withFile !== false) {
      fs.writeFileSync(doomedPath, 'DOOM');
    }
    fs.writeFileSync(path.join(archiveDir, 'AmiExpress', 'KEEPER.LHA'), 'KEEP');
    return doomedPath;
  }

  beforeEach(() => {
    jest.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-catalog-'));
    archiveDir = path.join(tmpDir, 'Archives');
    fs.mkdirSync(archiveDir, { recursive: true });
    dbPath = path.join(tmpDir, 'test.sqlite');
    process.env.DOOR_ARCHIVES_ROOT = archiveDir;
    process.env.DATABASE_DIR = tmpDir;
    process.env.DATABASE_FILE = 'test.sqlite';
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

  function rowCount(table: string, id?: string): number {
    const db = new Database(dbPath, { readonly: true });
    try {
      const sql = id
        ? `SELECT COUNT(*) AS n FROM ${table} WHERE ${table === 'door_catalog' ? 'id' : 'catalog_id'} = ?`
        : `SELECT COUNT(*) AS n FROM ${table}`;
      const row = (id ? db.prepare(sql).get(id) : db.prepare(sql).get()) as { n: number };
      return row.n;
    } finally {
      db.close();
    }
  }

  it('removes the catalog row, its file rows, and the archive from disk', () => {
    const doomedPath = seed();
    const result = svc().deleteCatalogEntry('id-doomed');

    expect(result.ok).toBe(true);
    expect(result.archiveName).toBe('DOOMED.LHA');
    expect(result.fileRemoved).toBe(true);
    expect(fs.existsSync(doomedPath)).toBe(false);
    expect(rowCount('door_catalog', 'id-doomed')).toBe(0);
    expect(rowCount('door_catalog_files', 'id-doomed')).toBe(0);
  });

  it('leaves every other door alone', () => {
    seed();
    svc().deleteCatalogEntry('id-doomed');

    expect(rowCount('door_catalog', 'id-keeper')).toBe(1);
    expect(rowCount('door_catalog_files', 'id-keeper')).toBe(1);
    expect(fs.existsSync(path.join(archiveDir, 'AmiExpress', 'KEEPER.LHA'))).toBe(true);
  });

  it('deletes a door that is installed, without touching the install', () => {
    // Uniform by design: repo curation does not consult local install state,
    // and never removes Doors/<CMD>/ or the BBS command. The door keeps
    // running; the repo forgets it.
    const doomedPath = seed({ installed: true });
    const result = svc().deleteCatalogEntry('id-doomed');

    expect(result.ok).toBe(true);
    expect(fs.existsSync(doomedPath)).toBe(false);
    expect(rowCount('door_catalog', 'id-doomed')).toBe(0);
  });

  it('still removes the rows when the archive file is already gone', () => {
    // The row is the thing that makes a door appear in list.txt, so a
    // missing file must not block the delete.
    seed({ withFile: false });
    const result = svc().deleteCatalogEntry('id-doomed');

    expect(result.ok).toBe(true);
    expect(result.fileRemoved).toBe(false);
    expect(rowCount('door_catalog', 'id-doomed')).toBe(0);
  });

  it('reports an unknown id instead of throwing', () => {
    seed();
    const result = svc().deleteCatalogEntry('id-does-not-exist');

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not found/i);
    // Nothing else was touched.
    expect(rowCount('door_catalog')).toBe(2);
  });

  it('changes the catalog revision, so every client refetches', () => {
    seed();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const manifest = require('../../src/doors/door-repo-manifest');
    const before = manifest.getCatalogRevision();

    svc().deleteCatalogEntry('id-doomed');

    expect(manifest.getCatalogRevision()).not.toBe(before);
  });
});
