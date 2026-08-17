/**
 * door-repo-manifest: builds an in-memory manifest of the door catalog and
 * renders it as list.txt — a byte-exact, ISO-8859-1/CRLF plain-text index
 * that legacy AmigaDOS door-repo clients (and 68K doors with no JSON
 * parser) can read directly over a socket, plus a JSON-friendly
 * DoorRepoManifest for modern (web) consumers.
 *
 * Checksums are read straight off the door_catalog row (md5/sha256 columns,
 * populated at index time by dev/scripts/door-corpus/build-door-catalog.ts —
 * see door-repo-checksums.ts's getArchiveChecksums, the function it reuses
 * for hashing). This is what keeps buildManifest() cheap: on a cold process
 * cache, synchronously fs.readFileSync + hashing ~3300 archives (167 MB)
 * blocks the Node event loop for ~22 SECONDS — during which the whole BBS
 * (telnet/SSH, WebSocket heartbeats, every other route) stalls. Reading a
 * precomputed column is a plain SELECT; no per-request hashing.
 *
 * A row with a still-NULL md5/sha256 (not yet (re)indexed) falls back to
 * computing it live via getArchiveChecksums — but bounded to at most
 * LAZY_CHECKSUM_FALLBACK_LIMIT rows per call. Past that bound, remaining
 * NULL rows are left null with the same ASCII WARN as before (never a
 * thrown error out of buildManifest) — the row still appears in the
 * manifest, and a consumer that tries to install it either gets a null
 * checksum (client-side skip) or 404s at download time if the archive is
 * genuinely missing. The bound exists so a request landing on an
 * un-backfilled/stale slice of the catalog degrades gracefully instead of
 * reproducing the original cold-cache stall.
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
  md5: string | null;
  sha256: string | null;
}

// Upper bound on how many rows buildManifest() will lazily hash (NULL
// md5/sha256, i.e. not yet indexed with digests) in a single call. At the
// measured ~5.9ms/file average (3669 files / 21760ms), 25 files is ~150ms
// worst case — comfortably under "a fraction of a second," even stacked
// with the rest of buildManifest's row-mapping work. Rows beyond the bound
// keep their NULL checksum and log the existing WARN; nothing throws.
export const LAZY_CHECKSUM_FALLBACK_LIMIT = 25;

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
             category, description, file_id_diz, archive_size, md5, sha256
      FROM door_catalog
      ${where}
      ORDER BY archive_name COLLATE NOCASE ASC
    `;
    rows = db.prepare(sql).all(...params) as DoorCatalogRow[];
  } finally {
    db.close();
  }

  let lazyFallbacksUsed = 0;

  const doors: ManifestDoor[] = rows.map((row) => {
    let md5: string | null = row.md5;
    let sha256: string | null = row.sha256;

    if (md5 === null || sha256 === null) {
      if (lazyFallbacksUsed < LAZY_CHECKSUM_FALLBACK_LIMIT) {
        lazyFallbacksUsed++;
        try {
          const absPath = resolveArchivePath(row.archive_path);
          const sums = getArchiveChecksums(absPath);
          md5 = sums.md5;
          sha256 = sums.sha256;
        } catch {
          md5 = null;
          sha256 = null;
          // eslint-disable-next-line no-console
          console.log(`[door-repo] WARN checksum unavailable: ${row.archive_name}`);
        }
      } else {
        md5 = null;
        sha256 = null;
        // eslint-disable-next-line no-console
        console.log(`[door-repo] WARN checksum not indexed and lazy-fallback limit (${LAZY_CHECKSUM_FALLBACK_LIMIT}) reached: ${row.archive_name}`);
      }
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

// `Buffer.from(str, 'latin1')` never throws on a character outside the
// ISO-8859-1 range: it silently truncates each UTF-16 code unit to its
// low byte (e.g. Cyrillic U+0416 becomes byte 0x16, an unrelated control
// character), producing a valid-looking but WRONG byte, not an error and
// not a visible marker. Against the real catalog this affects a handful of
// rows with non-ASCII metadata (accented names not in precomposed form,
// stray Unicode punctuation, etc.). Since these bytes are parsed by a real
// Amiga client with no Unicode awareness, an explicit '?' substitution is
// preferable to that silent corruption.
//
// Iterates by Unicode code point (not UTF-16 code unit), so an astral
// character encoded as a surrogate pair collapses to exactly one '?'
// ("a single '?' per character"), not two.
function toLatin1Safe(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    out += cp <= 0xff ? ch : '?';
  }
  return out;
}

export function renderListTxt(m: DoorRepoManifest): Buffer {
  const lines: string[] = [];
  lines.push(`DOORREPO|1|${m.revision}|${m.doors.length}`);

  for (const d of m.doors) {
    // oneLine() runs on every free-text field, not just description: a
    // raw CR/LF/TAB in archiveName or name would otherwise emit an extra
    // physical line, desyncing the header's `count` from the actual number
    // of data lines and breaking any naive line-by-line C parser — the
    // exact failure mode the byte-exact list.txt contract exists to
    // prevent. archiveName/name have no real-world source of embedded
    // newlines today (archiveName is a catalog-row column derived from an
    // archive's own filename; name comes from FILE_ID.DIZ/corpus
    // metadata), but the contract must hold for arbitrary catalog content,
    // not just today's corpus.
    const archiveName = toLatin1Safe(esc(oneLine(d.archiveName)));
    const doorType = d.doorType;
    const archiveSize = d.archiveSize ?? 0;
    const md5 = d.md5 ?? '';
    // No length cap on name: unlike description (capped at 120 to bound
    // line length against genuinely free-text DIZ content), name is a
    // short display label — real corpus max observed is 44 chars, nowhere
    // near a length that would threaten line-based parsing once oneLine()
    // has already removed the only thing that could break the one-row/
    // one-line invariant (embedded newlines). Capping it would be
    // speculative hardening against a problem that doesn't exist.
    const name = toLatin1Safe(esc(oneLine(d.name ?? '')));
    // '?' substitution happens BEFORE the 120-char slice: every character
    // remaining after toLatin1Safe occupies exactly one UTF-16 code unit
    // (latin1-range chars are single-unit; substituted chars are the
    // single-unit '?'), so the truncation boundary counts real output
    // characters instead of risking a cut through the middle of a
    // surrogate pair.
    const description = toLatin1Safe(esc(oneLine(d.description ?? ''))).slice(0, 120);
    lines.push(`${archiveName}|${doorType}|${archiveSize}|${md5}|${name}|${description}`);
  }

  const out = lines.join('\r\n') + '\r\n';
  return Buffer.from(out, 'latin1');
}
