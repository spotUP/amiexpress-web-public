import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import * as amigafs from '../utils/amigafs';

const MAX_REVISIONS_PER_FILE = 10;
const REVISIONS_DIR = 'Screens/.Revisions';

function revisionsRoot(): string {
  return path.resolve(path.join(config.get('dataDir'), REVISIONS_DIR));
}

/**
 * True if `full` is `root` itself or a genuine descendant of it — never a
 * sibling that merely shares `root` as a string prefix (`/data/bbs-evil`
 * looks like it "starts with" `/data/bbs` if you don't check for the
 * trailing separator). Both callers below used to skip this check entirely
 * (saveRevision) or get it wrong the same way containedScreenPath elsewhere
 * in this codebase already guards against (restoreRevision).
 */
function isContained(full: string, root: string): boolean {
  return full === root || full.startsWith(root + path.sep);
}

/**
 * Relative path of a screen file → its revisions directory.
 *
 * Lowercased before sanitising so every call site keys the SAME screen's
 * revisions to the SAME directory regardless of request casing. Only
 * saveRevision() is ever called with a resolved, on-disk-cased path (from
 * the PUT handler); listRevisions(), readRevision() and restoreRevision()'s
 * own internal saveRevision() call are all reached with the RAW request
 * string. Without normalising here, a save and a later list/read/restore
 * that disagree on case sanitise to two different directory names - names
 * that happen to collide back into one directory on a case-insensitive
 * host filesystem (macOS) but stay genuinely separate, and silently
 * invisible to each other, on a case-sensitive one (Linux, this board's
 * production containers). Lowercasing cannot merge two DIFFERENT screens:
 * this whole board already treats paths differing only by case as the same
 * screen (amigafs.resolvePath's case-insensitive lookup is what every read
 * goes through), so nothing genuinely distinct collides here that wasn't
 * already unreachable as a distinct file.
 *
 * Exported only so a test can assert the produced STRING is identical for
 * two differently-cased inputs - a black-box HTTP test can't tell "the key
 * is genuinely the same" apart from "the host filesystem folded two
 * different directory names together", and this board's production
 * containers run a case-SENSITIVE filesystem where that folding never
 * happens.
 */
export function revDirFor(relPath: string): string {
  // Sanitise: replace separators with a safe char so the path stays flat
  const safe = relPath.toLowerCase().replace(/[\\/]/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '_');
  return path.join(revisionsRoot(), safe);
}

export interface RevisionMeta {
  /** ISO timestamp of the snapshot. */
  ts: string;
  /** The revision filename (timestamp + hash). */
  file: string;
  /** Byte size of the original. */
  bytes: number;
  /**
   * The short (12 hex char) hash already embedded in the filename — NOT a
   * fresh full SHA256 of the file's bytes. Every list/prune pass used to
   * re-read and re-hash every revision's full content synchronously, on the
   * request thread, for every single screen save (dedup check, then again
   * for pruning) — this is the identity the filename already encodes, at
   * the cost of a readdir + regex instead of N full file reads.
   */
  sha256: string;
  /** Relative path of the original screen file. */
  source: string;
}

const REVISION_FILENAME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z_([0-9a-f]+)\.bin$/;

/**
 * Parse `<ts>_<shortHash>.bin` back into its parts without touching the
 * file's content. The encoding side is `new Date().toISOString().replace(
 * /[:.]/g, '-')` (saveRevision below) — every `:` AND the millisecond `.`
 * collapse to `-`, so decoding needs the FIXED positions the ISO format
 * guarantees, not a positional index into the whole string. The previous
 * version indexed the wrong character (its `i === 10` branch could never
 * fire — position 10 is `T`, not a match the surrounding `/-/g` replace
 * ever visits) and turned the seconds/milliseconds separator into a second
 * colon instead of a period, producing "...56:789Z" — not a valid ISO
 * string `new Date()` can parse, so every row fell back to the raw
 * filename instead of a readable timestamp.
 */
function parseRevisionFilename(file: string): { ts: string; shortHash: string } | null {
  const m = REVISION_FILENAME_RE.exec(file);
  if (!m) return null;
  const [, date, hh, mm, ss, ms, shortHash] = m;
  return { ts: `${date}T${hh}:${mm}:${ss}.${ms}Z`, shortHash };
}

/**
 * Snapshot a screen file before it is overwritten.
 *
 * Called from the PUT handler BEFORE the write happens, with the RESOLVED
 * relative path (from resolveScreenPath, via path.relative) — never a raw
 * request string. This function used to do nothing but `path.resolve(
 * baseDir, relPath)` with no containment check at all: a PUT body naming
 * `../../../../proc/self/environ` as a target walked straight out of the
 * board root, read the process's environment (JWT secret, DB credentials,
 * anything the container can open), and snapshotted it into this board's
 * own revisions directory — a live, unauthenticated-beyond-level-100
 * arbitrary file read. `isContained` here is independent, defense-in-depth
 * on top of the caller's own guard: a future call site that forgets to
 * pre-validate must not reopen this hole.
 */
export function saveRevision(relPath: string): void {
  const baseDir = config.get('dataDir');
  const root = path.resolve(baseDir);
  const joined = path.resolve(baseDir, relPath);
  if (!isContained(joined, root)) return;

  // Case-insensitive resolution, matching every other read in
  // screens-routes.ts (resolveScreenPath) — a bare fs.existsSync(joined)
  // silently no-ops on a Linux container when the request's casing doesn't
  // match the file's real casing, so a snapshot that "worked" on a
  // developer's Mac quietly never happened in production.
  const real = amigafs.resolvePath(joined);
  if (!real || !isContained(real, root) || !fs.existsSync(real)) return;

  const buf = fs.readFileSync(real);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const shortHash = sha256.slice(0, 12);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const revFile = `${ts}_${shortHash}.bin`;
  const revDir = revDirFor(relPath);

  // Don't store a revision identical to the latest one — compared by the
  // short hash already in that revision's filename, no read required.
  const existing = listRevisions(relPath);
  if (existing.length > 0 && existing[0].sha256 === shortHash) return;

  fs.mkdirSync(revDir, { recursive: true });
  fs.writeFileSync(path.join(revDir, revFile), buf);

  // Prune oldest — a second listRevisions() call is necessary (the
  // directory changed under the first one), but it's now a readdir + stat
  // + filename parse, not N full reads and N fresh SHA256s.
  const all = listRevisions(relPath);
  for (let i = MAX_REVISIONS_PER_FILE; i < all.length; i++) {
    try { fs.unlinkSync(path.join(revDir, all[i].file)); } catch { /* best effort */ }
  }
}

/**
 * List all revisions for a screen file, newest first. Reads directory
 * entries and stats them — never the file content (see RevisionMeta.sha256).
 */
export function listRevisions(relPath: string): RevisionMeta[] {
  const revDir = revDirFor(relPath);
  try {
    const files = fs.readdirSync(revDir)
      .filter(f => f.endsWith('.bin'))
      .sort()
      .reverse();

    return files.map(file => {
      const parsed = parseRevisionFilename(file);
      if (!parsed) return null;
      try {
        const stat = fs.statSync(path.join(revDir, file));
        return {
          ts: parsed.ts,
          file,
          bytes: stat.size,
          sha256: parsed.shortHash,
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
 * Read a specific revision's content by filename.
 *
 * `file` is caller-supplied (the GET /api/screens/revision route passes
 * req.query.file straight through) — `full === revDir` can never legitimately
 * happen (a revision is always a FILE under revDir, not revDir itself), and
 * the previous `full.startsWith(revDir)` check had the same sibling-prefix
 * hole `isContained` fixes elsewhere in this file, on top of never
 * rejecting a `file` value containing its own `../` traversal.
 */
export function readRevision(relPath: string, file: string): Buffer | null {
  const revDir = revDirFor(relPath);
  const full = path.resolve(revDir, file);
  if (!isContained(full, revDir)) return null;
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
  const root = path.resolve(baseDir);
  const joined = path.resolve(baseDir, relPath);
  if (!isContained(joined, root)) return false;

  // Resolve to the file's REAL on-disk path/casing before writing back — a
  // differently-cased restore request must overwrite the same file
  // everything else in this module treats as canonical, not create a
  // second, wrongly-cased duplicate beside it (the exact class of bug
  // screens-routes.ts's own top-of-file doc comment names). Falls back to
  // the joined path when nothing exists yet (the original screen was
  // deleted) — restoring should still be able to recreate it.
  const real = amigafs.resolvePath(joined) ?? joined;
  if (!isContained(real, root)) return false;

  // Snapshot the current file before overwriting, if there is one.
  saveRevision(relPath);

  fs.writeFileSync(real, buf);
  return true;
}
