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
  source: string | null;
  md5: string | null;
  sha256: string | null;
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

// The SQL below binds every CatalogEntry field EXCEPT md5/sha256 — those
// columns are populated exclusively by dev/scripts/door-corpus/
// build-door-catalog.ts's own inline upsert (which does compute digests via
// door-repo-checksums.ts's getArchiveChecksums at index time). Excluding
// them here keeps the type honest about what this function actually writes
// — passing `Omit<CatalogEntry, never>` (i.e. the full row shape, including
// md5/sha256) would force every typed caller to supply digest values this
// function silently discards.
export function upsertCatalogEntry(entry: Omit<CatalogEntry, 'md5' | 'sha256'>): void {
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

/**
 * Whether a repository archive can be stripped in place on this server.
 * Exposed so a door can decide what to OFFER before the user commits to
 * anything - DOORMAN asks this to know whether S does something for a door
 * that is not installed.
 */
export function canStripArchiveOnServer(archivePath: string): { ok: boolean; reason?: string } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { canDeleteMembers } = require('./lha-member-delete');
  return canDeleteMembers(archivePath);
}

export interface StripArchiveOnServerResult {
  ok: boolean;
  archiveName?: string;
  removed?: number;
  newSize?: number;
  reason?: string;
}

/**
 * Remove ad/junk files from a REPOSITORY archive, in place, and make the
 * catalog describe the archive that now exists.
 *
 * This is the "strip on the server" case, distinct from DOORMAN's existing
 * strip, which edits an already-installed door's directory and leaves the
 * published archive untouched. Here the published bytes change, so
 * everything derived from them has to change with it: size, md5, sha256, the
 * per-file rows. Leaving any of those stale would hand clients a digest that
 * no longer matches the file they download - the one failure this API's
 * whole verification story is built to prevent.
 *
 * Digests are recomputed from the file on disk rather than adjusted, because
 * only the file knows what it now contains.
 *
 * The row's archive_size and digests changing does NOT change the catalog
 * revision on its own (that is row count + max indexed_at), so indexed_at is
 * bumped too - otherwise clients would keep serving a cached catalog that
 * describes the pre-strip archive.
 */
export function stripArchiveOnServer(
  catalogId: string,
  memberPaths: string[]
): StripArchiveOnServerResult {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { deleteMembers, canDeleteMembers } = require('./lha-member-delete');
  const db = openDb();
  let row: { id: string; archive_name: string; archive_path: string } | undefined;
  try {
    row = db
      .prepare('SELECT id, archive_name, archive_path FROM door_catalog WHERE id = ?')
      .get(catalogId) as typeof row;
  } finally {
    db.close();
  }

  if (!row) {
    return { ok: false, reason: `catalog entry not found: ${catalogId}` };
  }
  if (memberPaths.length === 0) {
    return { ok: false, archiveName: row.archive_name, reason: 'nothing selected to strip' };
  }

  const absPath = resolveArchivePath(row.archive_path);
  if (!absPath || !fs.existsSync(absPath)) {
    return { ok: false, archiveName: row.archive_name, reason: 'archive not present on this server' };
  }

  const capability = canDeleteMembers(absPath);
  if (!capability.ok) {
    return { ok: false, archiveName: row.archive_name, reason: capability.reason };
  }

  const result = deleteMembers(absPath, memberPaths);
  if (!result.ok) {
    return { ok: false, archiveName: row.archive_name, reason: result.reason };
  }

  // Re-describe the archive that now exists.
  const size = fs.statSync(absPath).size;
  let md5: string | null = null;
  let sha256: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sums = require('./door-repo-checksums').getArchiveChecksums(absPath);
    md5 = sums.md5;
    sha256 = sums.sha256;
  } catch {
    // A digest we cannot compute must be NULL rather than the old value:
    // publishing a stale digest for changed bytes is worse than publishing
    // none, which clients already handle (see docs/DOOR-REPO-API.md).
  }

  const wdb = new Database(DB_PATH);
  try {
    const apply = wdb.transaction(() => {
      const del = wdb.prepare('DELETE FROM door_catalog_files WHERE catalog_id = ? AND path = ?');
      for (const p of memberPaths) {
        del.run(catalogId, p);
      }
      wdb.prepare(
        `UPDATE door_catalog
            SET archive_size = ?, md5 = ?, sha256 = ?,
                junk_count = (SELECT COUNT(*) FROM door_catalog_files f
                               WHERE f.catalog_id = ? AND f.is_junk = 1),
                indexed_at = ?
          WHERE id = ?`
      ).run(size, md5, sha256, catalogId, Math.floor(Date.now() / 1000), catalogId);
    });
    apply();
  } finally {
    wdb.close();
  }

  // eslint-disable-next-line no-console
  console.log(
    `[door-catalog] STRIPPED ${row.archive_name}: removed ${result.removed} file(s), now ${size} bytes`
  );

  return { ok: true, archiveName: row.archive_name, removed: result.removed, newSize: size };
}

export interface DeleteCatalogEntryResult {
  ok: boolean;
  archiveName?: string;
  /** Whether an archive file was actually unlinked (false when it was already gone). */
  fileRemoved?: boolean;
  reason?: string;
}

/**
 * Remove a door from the repository: its catalog row, its per-file rows, and
 * its archive on disk. Permanent - there is no undo and no backup.
 *
 * ORDER IS DELIBERATE: the archive file goes FIRST, then the rows.
 *
 * The indexer (dev/scripts/door-corpus/build-door-catalog.ts) walks the
 * archive directories and upserts whatever it finds, and it has no prune
 * step. So removing the rows first and failing to unlink would leave the
 * file behind for the next re-index to RESURRECT - silently undoing a
 * deliberate, irreversible action. File-first inverts that into a visible
 * and harmless failure instead: a row whose archive is missing, which
 * /archive already answers with a 404 by design (see docs/DOOR-REPO-API.md,
 * "Digest freshness" and section 5).
 *
 * Deletion is UNIFORM and does not consult `installed`. A door installed on
 * this BBS keeps working - its directory and BBS command are never touched -
 * the repository simply stops publishing it. That was a deliberate call:
 * install state and repository publication share a row but are different
 * concerns, and making curation wait on local state gets it backwards.
 *
 * Removing a row changes the row count, so getCatalogRevision() changes,
 * which invalidates the rendered-catalog cache and makes every client
 * refetch. Nothing else needs to be told.
 */
export function deleteCatalogEntry(id: string): DeleteCatalogEntryResult {
  const db = openDb();
  try {
    const row = db
      .prepare('SELECT id, archive_name, archive_path FROM door_catalog WHERE id = ?')
      .get(id) as { id: string; archive_name: string; archive_path: string } | undefined;

    if (!row) {
      return { ok: false, reason: `catalog entry not found: ${id}` };
    }

    let fileRemoved = false;
    const absPath = resolveArchivePath(row.archive_path);
    try {
      if (absPath && fs.existsSync(absPath)) {
        fs.unlinkSync(absPath);
        fileRemoved = true;
      }
    } catch (err: any) {
      // Stop here with the rows intact: the entry still resolves, and the
      // sysop can see exactly what failed. Continuing would publish a row
      // pointing at a file we could not remove.
      return {
        ok: false,
        archiveName: row.archive_name,
        reason: `could not delete ${absPath}: ${err?.message ?? err}`,
      };
    }

    const removeRows = db.transaction((catalogId: string) => {
      db.prepare('DELETE FROM door_catalog_files WHERE catalog_id = ?').run(catalogId);
      db.prepare('DELETE FROM door_catalog WHERE id = ?').run(catalogId);
    });
    removeRows(row.id);

    // Audit line: the archive is unrecoverable after this, so the log is the
    // only remaining record that it ever existed here.
    // eslint-disable-next-line no-console
    console.log(
      `[door-catalog] DELETED ${row.archive_name} (id=${row.id}, archive ${fileRemoved ? 'removed' : 'already missing'})`
    );

    return { ok: true, archiveName: row.archive_name, fileRemoved };
  } finally {
    db.close();
  }
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
