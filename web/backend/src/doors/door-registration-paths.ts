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

/** What another registration is, relative to the door being deleted. */
export type RegistrationClass = 'alias' | 'cotenant' | 'unrelated';

/**
 * Classify another registration against the door being deleted.
 *
 * - `alias`: the SAME binary under a second name. 5D-LogOff is registered as
 *   G; that registration IS this door and goes with it.
 * - `cotenant`: a DIFFERENT door in the same directory. Doors/emp_tools holds
 *   Joincnf (J) and Bulls (B). It stays, and so does the directory.
 * - `unrelated`: another door elsewhere - not this delete's business.
 *
 * The C door answers the same question in flow_registration_class()
 * (examples/doorrepo-c/flow.c), because on a real AmiExpress board there is
 * no server to ask. Both are held to
 * examples/doorrepo-c/tests/delete-rule-cases.txt.
 *
 * @param doorDir null when the door owns no directory - then nothing can
 *                share it and only an exact match is an alias
 */
export function classifyRegistration(
  otherLocation: string,
  doorLocation: string,
  doorDir: string | null,
): RegistrationClass {
  if (!otherLocation) return 'unrelated';

  const other = comparablePath(otherLocation);
  if (doorLocation && other === comparablePath(doorLocation)) return 'alias';
  if (!doorDir) return 'unrelated';

  const dir = comparablePath(doorDir);
  if (other === dir) return 'cotenant';

  // The separator is what keeps Doors/CALCULATOR from looking like part of
  // Doors/CALC.
  const rel = path.relative(dir, other);
  if (rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)) return 'cotenant';

  return 'unrelated';
}

/**
 * Where a command is registered, in the order express.e resolves it.
 *
 * express.e:4630-4647 tries CONFCMD, then NODECMD, then BBSCMD, and runs the
 * first that exists. The delete built one path - Commands/BBSCmd/<CMD>.info -
 * and answered "not found" for anything else, so a door registered only in
 * Conf12Cmd or Node0Cmd could be listed and run but never removed.
 *
 * Returns absolute .info paths, conference and node registrations first.
 * Matching is case-insensitive, as it is on an Amiga volume: this board has
 * `vsys.info` for the command VSYS.
 */
export function findCommandRegistrations(bbsRoot: string, command: string): string[] {
  const commandsRoot = path.join(bbsRoot, 'Commands');
  const wanted = `${command}.info`.toLowerCase();
  const conferenceOrNode: string[] = [];
  const global: string[] = [];

  let leaves: string[] = [];
  try { leaves = amigafs.readdirSync(commandsRoot); } catch { return []; }

  for (const leaf of leaves) {
    const dir = path.join(commandsRoot, leaf);
    try { if (!amigafs.statSync(dir).isDirectory()) continue; } catch { continue; }

    let entries: string[] = [];
    try { entries = amigafs.readdirSync(dir); } catch { continue; }
    for (const name of entries) {
      if (name.toLowerCase() !== wanted) continue;
      const abs = path.join(dir, name);
      // BBSCmd and SysCmd are the board-wide ones; everything else under
      // Commands/ is a Conf<N>Cmd or Node<N>Cmd directory, which outranks
      // them.
      if (/^(bbscmd|syscmd)$/i.test(leaf)) global.push(abs);
      else conferenceOrNode.push(abs);
    }
  }

  return [...conferenceOrNode, ...global];
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
