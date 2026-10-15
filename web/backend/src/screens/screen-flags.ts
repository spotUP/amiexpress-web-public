/**
 * What the SYSOP says about a screen file, over what the manager guessed.
 *
 * The index classifies a file as `backup` or `runtime` from its name and from
 * the signature of the tool that writes it. Both are heuristics, and this
 * board has already been told once that its live screens were read by nothing.
 * A sysop who can mark a file himself beats any heuristic, so this is the
 * override - including `art`, which says "the manager is wrong, I do edit
 * this one".
 *
 * On disk, in the board's own directory, because the board's truth is the
 * disk: a flag kept only in SQL would be lost the first time the volume was
 * reseeded, and invisible to anyone reading the board with their own eyes.
 * JSON rather than an Amiga icon - nothing in AmiExpress reads it, so there
 * is no format to match.
 */

import * as fs from 'fs';
import * as path from 'path';

/** `art` is the override that says the heuristic was wrong. */
export type ScreenFlag = 'backup' | 'runtime' | 'art';

const FLAGS_FILE = '.screen-flags.json';

/** Cached until the file's own mtime or size moves - the same rule the index uses. */
let cache: { key: string; flags: Record<string, ScreenFlag> } | null = null;

function flagsPath(baseDir: string): string {
  return path.join(baseDir, FLAGS_FILE);
}

export function readScreenFlags(baseDir: string): Record<string, ScreenFlag> {
  const file = flagsPath(baseDir);

  let key: string;
  try {
    const stat = fs.statSync(file);
    key = `${file}:${stat.size}:${stat.mtimeMs}`;
  } catch {
    // No file is the normal case on a board where nobody has overridden
    // anything, and is not worth a log line on every index build.
    cache = null;
    return {};
  }

  if (cache && cache.key === key) return cache.flags;

  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    const flags: Record<string, ScreenFlag> = {};
    if (parsed && typeof parsed === 'object') {
      for (const [rel, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (value === 'backup' || value === 'runtime' || value === 'art') flags[rel] = value;
      }
    }
    cache = { key, flags };
    return flags;
  } catch {
    // A corrupt override file must not take the whole index down with it: the
    // manager falls back to its own classification, which is what it did
    // before any of this existed.
    cache = { key, flags: {} };
    return {};
  }
}

/**
 * Set or clear one file's flag.
 *
 * `null` removes the override rather than storing "no opinion", so the file
 * goes back to whatever the heuristic says - which may since have changed.
 */
export function setScreenFlag(baseDir: string, relPath: string, flag: ScreenFlag | null): void {
  const flags = { ...readScreenFlags(baseDir) };

  if (flag === null) delete flags[relPath];
  else flags[relPath] = flag;

  const file = flagsPath(baseDir);
  if (Object.keys(flags).length === 0) {
    try {
      fs.unlinkSync(file);
    } catch {
      // Already gone is the outcome we wanted.
    }
  } else {
    fs.writeFileSync(file, `${JSON.stringify(flags, null, 2)}\n`, 'utf8');
  }

  cache = null;
}

/** Test seam: the cache is keyed on mtime, and a test can write twice in one millisecond. */
export function clearScreenFlagCache(): void {
  cache = null;
}
