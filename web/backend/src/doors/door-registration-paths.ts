/**
 * Path reasoning about door registrations: what a door owns, and who else
 * points at it.
 *
 * Extracted from amigaDoorManager on 2026-08-31, when the delete that used
 * this reasoning removed six doors the sysop had not asked it to. Kept apart
 * from the manager because these are questions about PATHS - none of them
 * removes anything, and the delete's containment guard still stands between
 * every answer here and the filesystem.
 */

import * as path from 'path';
import * as amigafs from '../utils/amigafs';

/**
 * One comparable form for a path on an Amiga volume.
 *
 * A LOCATION carries whatever casing the sysop's icon was written with -
 * `Doors:emp_tools/Joincnf` and `DOORS:EmP_Tools/Bulls` name the same
 * directory - and resolveAssign hands back the unresolved join when the file
 * is not there to canonicalise against. Comparing those as plain strings hid
 * the second door from the delete's neighbour scan, and hides an alias
 * registered in another casing from the orphan scan.
 *
 * Lower-casing is safe here for the reason amigafs exists: this tree is an
 * Amiga volume, where two files cannot differ only in case.
 */
export function comparablePath(p: string): string {
  const resolved = amigafs.resolvePath(p) || p;
  return path.resolve(resolved).toLowerCase();
}

/**
 * The directory a door owns, or null when it owns none.
 *
 * `dirname(LOCATION)` is not it, and believing that deleted six doors on
 * 2026-08-31. LOCATION names the door's EXECUTABLE, so its parent is whatever
 * directory that executable happens to sit in - shared with other doors
 * (Doors/emp_tools holds Joincnf and Bulls), or, when LOCATION names a
 * directory rather than a file (BestConf is `LOCATION=Doors:BestConf`),
 * Doors/ itself, which is every door on the board.
 *
 * So: a LOCATION that IS a directory is the door's directory; otherwise its
 * parent is - unless that parent is one of the roots, in which case the door
 * has no directory of its own and only its own files may be removed.
 *
 * The returned path keeps the filesystem's casing: something gets DELETED at
 * it.
 */
export function ownDirectoryOf(
  bbsRoot: string,
  doorsAssign: string | undefined,
  resolvedLocation: string,
): string | null {
  let candidate: string;
  try {
    candidate = amigafs.statSync(resolvedLocation).isDirectory()
      ? resolvedLocation
      : path.dirname(resolvedLocation);
  } catch {
    // Already gone - the half-deleted shape. Its parent is all that is left
    // to reason about, and the root check below is what makes that safe.
    candidate = path.dirname(resolvedLocation);
  }

  const roots = [
    bbsRoot,
    path.join(bbsRoot, 'Doors'),
    path.join(bbsRoot, 'Commands'),
    doorsAssign || path.join(bbsRoot, 'Doors'),
  ].map(comparablePath);
  if (roots.includes(comparablePath(candidate))) return null;

  return path.resolve(candidate);
}

/**
 * Every command registration under `Commands/` whose LOCATION resolves to
 * `target` or inside it.
 *
 * A door's registration is NOT reliably named after the door. 5D-LogOff is
 * registered as G (Commands/BBSCmd/G.info, LOCATION=Doors:5D-LogOff/...), so
 * deleting the door looked for 5D-LogOff.info, found nothing, and left G.info
 * pointing at a directory that no longer existed. On the live board that
 * orphan shadowed the internal goodbye command and made it impossible to log
 * off - the door was gone and its command still answered.
 *
 * The whole Commands tree is scanned, not just BBSCmd: this board also has
 * Conf3/6/7/9/11/12/13/14Cmd and Node0Cmd, and a registration in any of them
 * keeps a deleted door alive just as well.
 *
 * Returns absolute .info paths. Callers decide what each one MEANS - an alias
 * of the door, or a different door sharing its directory - and pass them
 * through the same containment guard as every other delete.
 *
 * @param resolveInfo returns an .info file's resolved LOCATION, or undefined
 */
export function findRegistrationsPointingInto(
  bbsRoot: string,
  target: string,
  resolveInfo: (infoPath: string) => string | undefined,
): string[] {
  const commandsRoot = path.join(bbsRoot, 'Commands');
  const comparableTarget = comparablePath(target);
  const hits: string[] = [];

  const walk = (dir: string): void => {
    let entries: string[] = [];
    try { entries = amigafs.readdirSync(dir); } catch { return; }
    for (const name of entries) {
      const abs = path.join(dir, name);
      let stats;
      try { stats = amigafs.lstatSync(abs); } catch { continue; }
      if (stats.isDirectory()) { walk(abs); continue; }
      if (!/\.info$/i.test(name)) continue;

      let resolved: string | undefined;
      try { resolved = resolveInfo(abs); } catch { continue; }
      if (!resolved) continue;

      // The registration counts as pointing into the door when its resolved
      // LOCATION is the target itself or anything beneath it. Compared in one
      // casing: see comparablePath.
      const rel = path.relative(comparableTarget, comparablePath(resolved));
      if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
        hits.push(abs);
      }
    }
  };

  walk(commandsRoot);
  return hits;
}
