/**
 * A new board is not seeded with THIS board's history.
 *
 * The image builds `/app/default-data` by copying whole directories out of
 * this repo, and this repo IS a running board - its node directories hold its
 * own logs. Measured 2026-09-02: the template would carry 4,384 files and
 * 57.8 MB, of which 40.2 MB is log data - 14.5 MB of DLogBackup, 11.9 MB of
 * UDLog-, 7.7 MB of UDLog, and 40 CallersLog files naming this board's
 * callers. A sysop installing amiexpress-web was handed uprough's download
 * history and caller log.
 *
 * The Dockerfile deletes those names after copying. This test fails when a
 * log the repo actually carries is not in that list, because the failure mode
 * is silent: nobody looks inside a 57 MB image layer, and the next log format
 * would ship the same way.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO = path.join(__dirname, '..', '..', '..');

/** The directories the image seeds a fresh board from. */
const SEEDED = [
  'Screens', 'Bulletins',
  ...Array.from({ length: 14 }, (_, i) => `Conf${i + 1}`),
  ...Array.from({ length: 41 }, (_, i) => `Node${i}`),
];

/**
 * What a log looks like on an AmiExpress board.
 *
 * express.e writes `Node<n>/CallersLog` and its siblings without an
 * extension, so there is no suffix to match on - the names themselves are the
 * pattern, and this is deliberately broad so a NEW log name is caught by the
 * test rather than by a sysop reading someone else's callers.
 */
const LOG_NAME = /(log|log-|logbackup|log\.back)$|\.log$/i;

/** The names the Dockerfile's prune step deletes from the template. */
function prunedNames(): string[] {
  const dockerfile = fs.readFileSync(path.join(REPO, 'Dockerfile'), 'utf8');
  const step = /RUN find \/app\/default-data([\s\S]*?)-type f -delete/.exec(dockerfile);
  if (!step) throw new Error('the Dockerfile no longer prunes board history from /app/default-data');

  // Lowercased: the step matches with -iname because the Amiga's filesystem
  // is case-insensitive, and so must this comparison.
  return [...step[1].matchAll(/-i?name '([^']+)'/g)].map(m => m[1].toLowerCase());
}

/** Whether a find(1) glob covers a name - `*log` matches `CallersLog`. */
function globMatches(glob: string, name: string): boolean {
  const pattern = glob.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${pattern}$`).test(name.toLowerCase());
}

/** Every file name the seeded directories actually contain. */
function seededFileNames(): Map<string, string[]> {
  const found = new Map<string, string[]>();

  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else found.set(entry.name, [...(found.get(entry.name) ?? []), path.relative(REPO, full)]);
    }
  };

  for (const dir of SEEDED) walk(path.join(REPO, dir));
  return found;
}

test('the Dockerfile still prunes board history from the template', () => {
  expect(prunedNames().length).toBeGreaterThan(0);
});

test('every log this repo carries is pruned, so no installer is seeded with our callers', () => {
  const pruned = new Set(prunedNames());
  const missed: string[] = [];

  for (const [name, paths] of seededFileNames()) {
    if (!LOG_NAME.test(name)) continue;
    if ([...pruned].some(glob => globMatches(glob, name))) continue;
    missed.push(`${name} (${paths.length} file${paths.length === 1 ? '' : 's'}, e.g. ${paths[0]})`);
  }

  // Joined rather than compared as an array: the failure then prints the
  // names to add to the prune step instead of a diff of eighty paths.
  expect(missed.join('\n')).toBe('');
});

test('the prune names nothing a board needs to run', () => {
  // Config and content are what a fresh board is FOR. If one of these is ever
  // added to the prune list, a new install comes up without its conferences.
  const needed = ['Conf.DB', 'ConfConfig.info', 'BBSHelp.txt', 'express'];

  const globs = prunedNames();
  expect(needed.filter(n => globs.some(glob => globMatches(glob, n)))).toEqual([]);
});

test('the prune deletes files only, never a directory a board expects to exist', () => {
  const dockerfile = fs.readFileSync(path.join(REPO, 'Dockerfile'), 'utf8');
  const step = /RUN find \/app\/default-data[\s\S]*?-delete/.exec(dockerfile)![0];

  expect(step).toContain('-type f');
});
