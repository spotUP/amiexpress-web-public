import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';

const MAX_REVISIONS_PER_FILE = 10;
const REVISIONS_DIR = 'Screens/.Revisions';

function revisionsRoot(): string {
  return path.resolve(path.join(config.get('dataDir'), REVISIONS_DIR));
}

/** Relative path of a screen file → its revisions directory. */
function revDirFor(relPath: string): string {
  // Sanitise: replace separators with a safe char so the path stays flat
  const safe = relPath.replace(/[\\/]/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '_');
  return path.join(revisionsRoot(), safe);
}

export interface RevisionMeta {
  /** ISO timestamp of the snapshot. */
  ts: string;
  /** The revision filename (timestamp + hash). */
  file: string;
  /** Byte size of the original. */
  bytes: number;
  /** SHA256 of the original — for dedup. */
  sha256: string;
  /** Relative path of the original screen file. */
  source: string;
}

/**
 * Snapshot a screen file before it is overwritten.
 *
 * Called from the PUT handler BEFORE the write happens. Stores the current
 * content in `Screens/.Revisions/<safe-name>/<ts>_<short-hash>.bin` and
 * prunes to MAX_REVISIONS_PER_FILE.
 */
export function saveRevision(relPath: string): void {
  const baseDir = config.get('dataDir');
  const full = path.resolve(baseDir, relPath);
  if (!fs.existsSync(full)) return;

  const buf = fs.readFileSync(full);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const shortHash = sha256.slice(0, 12);
  const revFile = `${ts}_${shortHash}.bin`;
  const revDir = revDirFor(relPath);

  fs.mkdirSync(revDir, { recursive: true });

  // Don't store a revision identical to the latest one
  const existing = listRevisions(relPath);
  if (existing.length > 0 && existing[0].sha256 === sha256) return;

  fs.writeFileSync(path.join(revDir, revFile), buf);

  // Prune oldest
  const all = listRevisions(relPath);
  for (let i = MAX_REVISIONS_PER_FILE; i < all.length; i++) {
    try { fs.unlinkSync(path.join(revDir, all[i].file)); } catch { /* best effort */ }
  }
}

/**
 * List all revisions for a screen file, newest first.
 */
export function listRevisions(relPath: string): RevisionMeta[] {
  const revDir = revDirFor(relPath);
  try {
    const files = fs.readdirSync(revDir)
      .filter(f => f.endsWith('.bin'))
      .sort()
      .reverse();

    return files.map(file => {
      const fullPath = path.join(revDir, file);
      try {
        const buf = fs.readFileSync(fullPath);
        const stat = fs.statSync(fullPath);
        // Parse ts prefix: "2026-09-04T22-30-00-000Z_abcd1234.bin"
        const ts = file.replace(/_\w+\.bin$/, '').replace(/-/g, (m, i) =>
          i === 10 ? 'T' : i === 13 || i === 16 || i === 19 ? ':' : m);
        return {
          ts: ts,
          file,
          bytes: buf.length,
          sha256: crypto.createHash('sha256').update(buf).digest('hex'),
          source: relPath,
        };
      } catch {
        return null;
      }
    }).filter((r): r is RevisionMeta => r !== null);
  } catch {
    return [];
  }
}

/**
 * Read a specific revision's content.
 */
export function readRevision(relPath: string, file: string): Buffer | null {
  const revDir = revDirFor(relPath);
  const full = path.join(revDir, file);
  if (!full.startsWith(revDir)) return null; // guard traversal
  try {
    return fs.readFileSync(full);
  } catch {
    return null;
  }
}

/**
 * Restore a revision: copy it back to the original path, creating a new
 * revision of the current content first.
 */
export function restoreRevision(relPath: string, file: string): boolean {
  const buf = readRevision(relPath, file);
  if (!buf) return false;

  const baseDir = config.get('dataDir');
  const full = path.resolve(baseDir, relPath);
  if (!full.startsWith(path.resolve(baseDir))) return false;

  // Snapshot the current file before overwriting
  saveRevision(relPath);

  fs.writeFileSync(full, buf);
  return true;
}