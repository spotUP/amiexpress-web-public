import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', '..', '..', '..', 'database.sqlite');

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
  return new Database(DB_PATH, { readonly: false });
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
        '(name LIKE ? OR author LIKE ? OR release_group LIKE ? OR description LIKE ? OR installed_as LIKE ?)'
      );
      params.push(like, like, like, like, like);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM door_catalog ${where} ORDER BY name COLLATE NOCASE ASC LIMIT 500`;
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
