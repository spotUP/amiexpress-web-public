import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(
  process.env.DATABASE_DIR || path.join(__dirname, '..', '..', '..', '..'),
  process.env.DATABASE_FILE || 'database.sqlite'
);

const SEED_PATH = path.join(__dirname, '..', '..', 'seeds', 'door-catalog-seed.sql');
const FILES_SEED_PATH = path.join(__dirname, '..', '..', 'seeds', 'door-catalog-files-seed.sql');

function seedIfEmpty(db: Database.Database): void {
  try {
    const count = (db.prepare('SELECT count(*) as n FROM door_catalog').get() as any)?.n ?? 0;
    if (count === 0 && fs.existsSync(SEED_PATH)) db.exec(fs.readFileSync(SEED_PATH, 'utf-8'));
    // Seed files table separately (may be populated independently)
    const fileCount = (db.prepare('SELECT count(*) as n FROM door_catalog_files').get() as any)?.n ?? 0;
    if (fileCount === 0 && fs.existsSync(FILES_SEED_PATH)) db.exec(fs.readFileSync(FILES_SEED_PATH, 'utf-8'));
  } catch { /* ignore seed errors */ }
}

export interface CatalogEntry {
  id: string;
  archive_name: string;
  archive_path: string;
  binary_name: string | null;
  door_type: string;
  name: string;
  version: string | null;
  author: string | null;
  release_group: string | null;
  description: string | null;
  file_id_diz: string | null;
  doc_filename: string | null;
  doc_raw: string | null;
  suggested_tooltypes: string | null;
  category: string | null;
  archive_size: number;
  junk_count: number;
  installed: number;
  installed_as: string | null;
  install_dir: string | null;
  corpus_id: string | null;
}

function openDb(): Database.Database {
  const db = new Database(DB_PATH, { readonly: false });
  seedIfEmpty(db);
  return db;
}

// ─── Archive path resolution ───────────────────────────────────────────────
//
// door_catalog.archive_path is stored RELATIVE to an "archives root"
// (e.g. "FAME/5D!STC01.LHA"). The archives root differs per machine — local
// dev checkouts keep the 174MB archive corpus outside the repo, and the
// live server keeps it on the persistent data volume — so it is resolved
// at read time, never baked into the DB. Older rows (pre-migration) may
// still carry a full machine-specific absolute path; resolveArchivePath
// handles both forms so it is safe to call unconditionally.
//
// This is the single source of truth: every consumer (DOORMAN's install/
// strip/browse flows, the catalog builder, any future backend route) must
// go through this function rather than reading archive_path directly.

const DEV_ARCHIVES_ROOT_DEFAULT = '~/Code/amiexpress_doors/Archives';

export function resolveArchiveRoot(): string {
  const envRoot = process.env.DOOR_ARCHIVES_ROOT;
  if (envRoot) return envRoot;
  const bbsDataDir = process.env.BBS_DATA_DIR || '/app/data/bbs';
  const serverRoot = path.join(bbsDataDir, 'Archives');
  if (fs.existsSync(serverRoot)) return serverRoot;
  return DEV_ARCHIVES_ROOT_DEFAULT;
}

/**
 * Strip a machine-specific absolute prefix down to the portion after the
 * last "/Archives/" path segment (e.g.
 * "/Users/x/amiexpress_doors/Archives/FAME/foo.lha" -> "FAME/foo.lha").
 * Already-relative paths are returned unchanged.
 */
function toRelativeArchivePath(archivePath: string): string {
  if (!path.isAbsolute(archivePath)) return archivePath;
  const marker = `${path.sep}Archives${path.sep}`;
  const idx = archivePath.lastIndexOf(marker);
  if (idx === -1) return archivePath;
  return archivePath.slice(idx + marker.length);
}

/**
 * Resolve a door_catalog.archive_path value to an absolute path on THIS
 * machine. Order: (1) if it's already an absolute path that exists here,
 * use it as-is (covers un-migrated rows on the machine they were indexed
 * on); (2) otherwise relativize it and join against the resolved archives
 * root (env override, else the server volume path if present, else the
 * dev default).
 */
export function resolveArchivePath(archivePath: string): string {
  if (!archivePath) return archivePath;
  if (path.isAbsolute(archivePath) && fs.existsSync(archivePath)) return archivePath;
  const root = resolveArchiveRoot();
  return path.join(root, toRelativeArchivePath(archivePath));
}

export function searchCatalog(query: string, installedOnly?: boolean): CatalogEntry[] {
  const db = openDb();
  try {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (installedOnly) {
      conditions.push('installed = 1');
    }

    if (query.trim()) {
      const like = `%${query.trim()}%`;
      conditions.push(
        '(archive_name LIKE ? OR name LIKE ? OR author LIKE ? OR release_group LIKE ? OR description LIKE ? OR installed_as LIKE ?)'
      );
      params.push(like, like, like, like, like, like);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM door_catalog ${where} ORDER BY archive_name COLLATE NOCASE ASC LIMIT 500`;
    return db.prepare(sql).all(...params) as CatalogEntry[];
  } finally {
    db.close();
  }
}

export function getCatalogEntry(id: string): CatalogEntry | null {
  const db = openDb();
  try {
    return (db.prepare('SELECT * FROM door_catalog WHERE id = ?').get(id) as CatalogEntry) ?? null;
  } finally {
    db.close();
  }
}

export function getCatalogEntryByArchive(archiveName: string): CatalogEntry | null {
  const db = openDb();
  try {
    return (
      (db
        .prepare('SELECT * FROM door_catalog WHERE archive_name = ? COLLATE NOCASE')
        .get(archiveName) as CatalogEntry) ?? null
    );
  } finally {
    db.close();
  }
}

export function markInstalled(id: string, cmd: string, dir: string): void {
  const db = openDb();
  try {
    db.prepare(
      'UPDATE door_catalog SET installed = 1, installed_as = ?, install_dir = ? WHERE id = ?'
    ).run(cmd, dir, id);
  } finally {
    db.close();
  }
}

export function markUninstalled(id: string): void {
  const db = openDb();
  try {
    db.prepare(
      'UPDATE door_catalog SET installed = 0, installed_as = NULL, install_dir = NULL WHERE id = ?'
    ).run(id);
  } finally {
    db.close();
  }
}

export function getCatalogEntryByCmd(cmd: string): CatalogEntry | null {
  const db = openDb();
  try {
    return (
      (db.prepare('SELECT * FROM door_catalog WHERE installed_as = ? COLLATE NOCASE').get(cmd) as CatalogEntry) ?? null
    );
  } finally {
    db.close();
  }
}

export function updateJunkCount(id: string, count: number): void {
  const db = openDb();
  try {
    db.prepare('UPDATE door_catalog SET junk_count = ? WHERE id = ?').run(count, id);
  } finally {
    db.close();
  }
}

export function catalogStats(): { total: number; installed: number } {
  const db = openDb();
  try {
    const row = db
      .prepare('SELECT COUNT(*) as total, SUM(installed) as installed FROM door_catalog')
      .get() as { total: number; installed: number };
    return { total: row.total ?? 0, installed: row.installed ?? 0 };
  } finally {
    db.close();
  }
}

export function upsertCatalogEntry(entry: Omit<CatalogEntry, never>): void {
  const db = openDb();
  try {
    db.prepare(`
      INSERT INTO door_catalog (
        id, archive_name, archive_path, binary_name, door_type, name, version,
        author, release_group, description, file_id_diz, doc_filename, doc_raw,
        suggested_tooltypes, category, archive_size, junk_count, installed,
        installed_as, install_dir, corpus_id, source
      ) VALUES (
        @id, @archive_name, @archive_path, @binary_name, @door_type, @name, @version,
        @author, @release_group, @description, @file_id_diz, @doc_filename, @doc_raw,
        @suggested_tooltypes, @category, @archive_size, @junk_count, @installed,
        @installed_as, @install_dir, @corpus_id, @source
      )
      ON CONFLICT(id) DO UPDATE SET
        archive_name = excluded.archive_name,
        archive_path = excluded.archive_path,
        binary_name = excluded.binary_name,
        door_type = excluded.door_type,
        name = excluded.name,
        version = excluded.version,
        author = excluded.author,
        release_group = excluded.release_group,
        description = excluded.description,
        file_id_diz = excluded.file_id_diz,
        doc_filename = excluded.doc_filename,
        doc_raw = excluded.doc_raw,
        suggested_tooltypes = excluded.suggested_tooltypes,
        category = excluded.category,
        archive_size = excluded.archive_size,
        junk_count = excluded.junk_count,
        corpus_id = excluded.corpus_id,
        source = excluded.source,
        indexed_at = strftime('%s','now')
    `).run(entry);
  } finally {
    db.close();
  }
}

export interface ArchiveFile {
  catalog_id: string;
  path: string;
  size: number;
  is_junk: number;
  junk_reason: string | null;
}

export function getArchiveFiles(catalogId: string): ArchiveFile[] {
  const db = openDb();
  try {
    return db.prepare('SELECT * FROM door_catalog_files WHERE catalog_id = ? ORDER BY path ASC')
      .all(catalogId) as ArchiveFile[];
  } finally {
    db.close();
  }
}

export function upsertArchiveFiles(catalogId: string, files: Array<{ path: string; size: number; is_junk: number; junk_reason: string | null }>): void {
  const db = openDb();
  try {
    const stmt = db.prepare(
      'INSERT OR REPLACE INTO door_catalog_files (catalog_id, path, size, is_junk, junk_reason) VALUES (?, ?, ?, ?, ?)'
    );
    const insertAll = db.transaction(() => {
      for (const f of files) stmt.run(catalogId, f.path, f.size, f.is_junk, f.junk_reason);
    });
    insertAll();
  } finally {
    db.close();
  }
}

export function removeArchiveFiles(catalogId: string, paths: string[]): void {
  if (paths.length === 0) return;
  const db = openDb();
  try {
    const stmt = db.prepare('DELETE FROM door_catalog_files WHERE catalog_id = ? AND path = ?');
    const deleteAll = db.transaction(() => {
      for (const p of paths) stmt.run(catalogId, p);
    });
    deleteAll();
  } finally {
    db.close();
  }
}
