/**
 * door-repo-manifest: builds an in-memory manifest of the door catalog and
 * renders it as list.txt — a byte-exact, ISO-8859-1/CRLF plain-text index
 * that legacy AmigaDOS door-repo clients (and 68K doors with no JSON
 * parser) can read directly over a socket, plus a JSON-friendly
 * DoorRepoManifest for modern (web) consumers.
 *
 * Checksums come from Task 1's getArchiveChecksums (door-repo-checksums.ts)
 * and are looked up lazily per archive; a missing/unreadable archive file
 * yields null md5/sha256 (never a thrown error out of buildManifest) — the
 * row still appears in the manifest, and a consumer that tries to install
 * it 404s at download time, which is the loud failure, not manifest
 * generation.
 */
import Database from 'better-sqlite3';
import * as path from 'path';
import { getArchiveChecksums } from './door-repo-checksums';
import { resolveArchivePath } from './door-catalog.service';
import { getRepoRevision } from '../server/repo-revision';

export interface ManifestDoor {
  archiveName: string;
  doorType: string;
  name: string | null;
  author: string | null;
  releaseGroup: string | null;
  category: string | null;
  description: string | null;
  fileIdDiz: string | null;
  archiveSize: number | null;
  md5: string | null;
  sha256: string | null;
}

export interface DoorRepoManifest {
  formatVersion: 1;
  revision: string;
  generatedAt: string;
  doors: ManifestDoor[];
}

// ─── DB access ──────────────────────────────────────────────────────────
//
// Mirrors door-catalog.service.ts's DB-open approach (same resolved path,
// same env vars) rather than reimplementing catalog resolution. That
// module doesn't export a reusable open handle, so we open the same
// resolved path READONLY here — this module never writes to door_catalog.

const DB_PATH = path.join(
  process.env.DATABASE_DIR || path.join(__dirname, '..', '..', '..', '..'),
  process.env.DATABASE_FILE || 'database.sqlite'
);

function openDb(): Database.Database {
  return new Database(DB_PATH, { readonly: true });
}

interface DoorCatalogRow {
  archive_name: string;
  archive_path: string;
  door_type: string;
  name: string | null;
  author: string | null;
  release_group: string | null;
  category: string | null;
  description: string | null;
  file_id_diz: string | null;
  archive_size: number | null;
}

// ─── Revision source ────────────────────────────────────────────────────
//
// Must reuse the exact same revision the /health endpoint reports. Both
// /health (web/backend/src/server/app.ts) and this module import the
// single shared implementation from web/backend/src/server/repo-revision.ts
// — a pure fs/env module with no express imports, so it's safe to import
// here without dragging in the HTTP stack. Re-exported (not just called)
// so `getRepoRevision` stays part of this module's public API per its
// documented interface.

export { getRepoRevision } from '../server/repo-revision';

// ─── Lightweight door count ─────────────────────────────────────────────
//
// A plain `SELECT COUNT(*)` with no row mapping and no checksum work — for
// callers (the /health endpoint) that only need "how many doors" and must
// not pay buildManifest()'s per-archive md5/sha256 cost (~3300 files) on
// every call.

export function getDoorCount(): number {
  const db = openDb();
  try {
    const row = db.prepare('SELECT COUNT(*) as n FROM door_catalog').get() as { n: number };
    return row.n;
  } finally {
    db.close();
  }
}

// ─── Manifest builder ───────────────────────────────────────────────────

export function buildManifest(opts?: { type?: string; q?: string }): DoorRepoManifest {
  const db = openDb();
  let rows: DoorCatalogRow[];
  try {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (opts?.type) {
      conditions.push('door_type = ?');
      params.push(opts.type);
    }

    if (opts?.q && opts.q.trim()) {
      const like = `%${opts.q.trim()}%`;
      conditions.push(
        '(archive_name LIKE ? OR name LIKE ? OR author LIKE ? OR release_group LIKE ? OR description LIKE ? OR installed_as LIKE ?)'
      );
      params.push(like, like, like, like, like, like);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT archive_name, archive_path, door_type, name, author, release_group,
             category, description, file_id_diz, archive_size
      FROM door_catalog
      ${where}
      ORDER BY archive_name COLLATE NOCASE ASC
    `;
    rows = db.prepare(sql).all(...params) as DoorCatalogRow[];
  } finally {
    db.close();
  }

  const doors: ManifestDoor[] = rows.map((row) => {
    let md5: string | null = null;
    let sha256: string | null = null;
    try {
      const absPath = resolveArchivePath(row.archive_path);
      const sums = getArchiveChecksums(absPath);
      md5 = sums.md5;
      sha256 = sums.sha256;
    } catch {
      // eslint-disable-next-line no-console
      console.log(`[door-repo] WARN checksum unavailable: ${row.archive_name}`);
    }

    return {
      archiveName: row.archive_name,
      doorType: row.door_type,
      name: row.name,
      author: row.author,
      releaseGroup: row.release_group,
      category: row.category,
      description: row.description,
      fileIdDiz: row.file_id_diz,
      archiveSize: row.archive_size,
      md5,
      sha256,
    };
  });

  return {
    formatVersion: 1,
    revision: getRepoRevision(),
    generatedAt: new Date().toISOString(),
    doors,
  };
}

// ─── list.txt renderer ──────────────────────────────────────────────────
//
// Byte-exact ISO-8859-1 (latin1) plain text, CRLF line endings, for
// AmigaDOS-side clients with no JSON parser:
//   DOORREPO|1|<revision>|<count>
//   <archiveName>|<doorType>|<archiveSize>|<md5>|<name>|<description>
//   ... (one line per door)
// with a trailing CRLF after the last row.

function esc(s: string): string {
  return s.replace(/\|/g, '!');
}

function oneLine(s: string): string {
  return s.replace(/[\r\n\t]+/g, ' ');
}

export function renderListTxt(m: DoorRepoManifest): Buffer {
  const lines: string[] = [];
  lines.push(`DOORREPO|1|${m.revision}|${m.doors.length}`);

  for (const d of m.doors) {
    const archiveName = esc(d.archiveName);
    const doorType = d.doorType;
    const archiveSize = d.archiveSize ?? 0;
    const md5 = d.md5 ?? '';
    const name = esc(d.name ?? '');
    const description = esc(oneLine(d.description ?? '')).slice(0, 120);
    lines.push(`${archiveName}|${doorType}|${archiveSize}|${md5}|${name}|${description}`);
  }

  const out = lines.join('\r\n') + '\r\n';
  return Buffer.from(out, 'latin1');
}
