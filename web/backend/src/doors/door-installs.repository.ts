/**
 * The record of doors installed on THIS node.
 *
 * The catalog itself moved to the standalone door server, which knows
 * nothing about who installed what - so `installed`, `installed_as` and
 * `install_dir` could not move with it. They live here instead.
 *
 * `archive_name` is the durable join key against the shared catalog:
 * `catalog_id` is the remote row id and is allowed to go stale, because the
 * server may re-index or delete a row without telling anyone.
 */
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export interface DoorInstall {
  id: string;
  catalog_id: string | null;
  archive_name: string;
  command: string;
  install_dir: string;
  door_type: string | null;
  name: string | null;
  md5: string | null;
  /** Display metadata snapshotted at install time - BBSApi overlays these
   *  onto the doors list, and the shared catalog is no longer local. */
  description: string | null;
  category: string | null;
  version: string | null;
  release_group: string | null;
  installed_at: number;
  source_url: string | null;
  source_revision: string | null;
}

function dbPath(): string {
  return path.join(
    process.env.DATABASE_DIR || path.join(__dirname, '..', '..', '..', '..'),
    process.env.DATABASE_FILE || 'database.sqlite'
  );
}

function openDb(readonly = false): Database.Database {
  return new Database(dbPath(), { readonly });
}

export function ensureSchema(db: Database.Database): void {
  db.exec(fs.readFileSync(path.join(__dirname, 'door-installs.schema.sql'), 'utf-8'));
}

export function recordInstall(
  entry: Omit<DoorInstall, 'installed_at'> & { installed_at?: number }
): void {
  const db = openDb();
  try {
    db.prepare(
      `INSERT INTO door_installs
         (id, catalog_id, archive_name, command, install_dir, door_type, name, md5,
          description, category, version, release_group,
          installed_at, source_url, source_revision)
       VALUES (@id, @catalog_id, @archive_name, @command, @install_dir, @door_type,
               @name, @md5, @description, @category, @version, @release_group,
               @installed_at, @source_url, @source_revision)
       ON CONFLICT(command) DO UPDATE SET
         id = excluded.id, catalog_id = excluded.catalog_id,
         archive_name = excluded.archive_name, install_dir = excluded.install_dir,
         door_type = excluded.door_type, name = excluded.name, md5 = excluded.md5,
         description = excluded.description, category = excluded.category,
         version = excluded.version, release_group = excluded.release_group,
         installed_at = excluded.installed_at, source_url = excluded.source_url,
         source_revision = excluded.source_revision`
    ).run({ ...entry, installed_at: entry.installed_at ?? Math.floor(Date.now() / 1000) });
  } finally {
    db.close();
  }
}

export function removeInstall(command: string): void {
  const db = openDb();
  try {
    db.prepare('DELETE FROM door_installs WHERE command = ?').run(command);
  } finally {
    db.close();
  }
}

export function getInstallByCommand(command: string): DoorInstall | null {
  const db = openDb(true);
  try {
    return (db.prepare('SELECT * FROM door_installs WHERE command = ?')
      .get(command) as DoorInstall | undefined) ?? null;
  } finally {
    db.close();
  }
}

export function getInstallByArchive(archiveName: string): DoorInstall | null {
  const db = openDb(true);
  try {
    return (db.prepare('SELECT * FROM door_installs WHERE archive_name = ? COLLATE NOCASE')
      .get(archiveName) as DoorInstall | undefined) ?? null;
  } finally {
    db.close();
  }
}

export function listInstalls(): DoorInstall[] {
  const db = openDb(true);
  try {
    return db.prepare('SELECT * FROM door_installs ORDER BY command').all() as DoorInstall[];
  } finally {
    db.close();
  }
}

export function isArchiveInstalled(archiveName: string): boolean {
  return getInstallByArchive(archiveName) !== null;
}
