/**
 * Who may write which screen files.
 *
 * SP5 of the screen-themes spec. Today `/api/screens` is mounted behind
 * `requireLevel(100)` and every write past that gate may touch any screen on
 * the board (`routes-setup.ts:192`). An artist needs an admin account to use
 * the screen editor at all, and that account would then be able to redraw the
 * live board - which is the opposite of a sandbox.
 *
 * The capability comes from OWNERSHIP, not from a new role: the registry
 * already records `OWNER.n` per theme, so "what may this account write" is
 * answered by "which themes does it own", with no second permission system to
 * keep in step.
 */

import * as path from 'path';

import { readThemeRegistry, themeDirectory, type ThemeEntry } from './theme-registry';
import { resolveNodeScreenDir } from './screen-resolution';
import { conferenceDir } from '../conferences/conference-paths';
import { conferenceNumbers } from '../conferences/conference-paths';
import * as fs from 'fs';

export interface ScreenWriter {
  username?: string;
  secLevel?: number;
}

/** The board's own level for "may administer". */
const SYSOP_LEVEL = 255;

export function isSysop(writer: ScreenWriter): boolean {
  return (writer.secLevel ?? 0) >= SYSOP_LEVEL;
}

/** The themes this account owns, by the registry's own OWNER.n. */
export function ownedThemes(bbsRoot: string, writer: ScreenWriter): ThemeEntry[] {
  const username = (writer.username ?? '').trim().toLowerCase();
  if (username === '') return [];
  return readThemeRegistry(bbsRoot).themes.filter(
    theme => theme.owner.trim().toLowerCase() === username
  );
}

/**
 * The directories this account may write into, absolute and resolved.
 *
 * A sysop gets the board root, which is what the screen editor has always
 * had. An artist gets their own theme directories and nothing else - not
 * `Screens/`, not another artist's theme, not the board root.
 *
 * An account that owns nothing gets NOTHING, deliberately: an admin account
 * that is not a sysop and owns no theme has no business rewriting board art,
 * and this is the change in posture the spec asks for.
 */
export function writableRoots(bbsRoot: string, writer: ScreenWriter): string[] {
  if (isSysop(writer)) return [path.resolve(bbsRoot)];

  const owned = ownedThemes(bbsRoot, writer);
  const roots = owned
    .map(theme => themeDirectory(bbsRoot, theme))
    .filter((dir): dir is string => dir !== null)
    .map(dir => path.resolve(dir));

  // THE BOARD'S OWN SCREENS, when this account owns the `default` entry.
  //
  // `default` is the board itself and has no directory of its own, so
  // `themeDirectory` answers null for it and an artist given it could write
  // nothing. The sysop asked for exactly this: "while developing amiexpress
  // the sysop needs to be able to edit the default theme as well, also tango
  // needs to be able to do it as he will make it".
  //
  // The grant is the ART, not the board: the global screen tree, each node's
  // screen directory when it is a shared one, and each conference's Screens/.
  // A conference's own directory and a node's own directory are NOT granted -
  // they hold message bases, caller logs and the board's runtime state, and a
  // theme owner has no business writing those. A screen the board keeps
  // directly in `Conf<n>/` stays the sysop's to edit.
  if (owned.some(theme => themeDirectory(bbsRoot, theme) === null)) {
    roots.push(...boardScreenRoots(bbsRoot));
  }

  return roots;
}

/** The directories the board keeps ART in - never its state. */
export function boardScreenRoots(bbsRoot: string): string[] {
  const roots = new Set<string>([path.resolve(bbsRoot, 'Screens')]);

  // A node whose SCREENS tooltype points somewhere shared - `Screens/Node/` on
  // this board - draws from there; a node with no tooltype draws from its own
  // directory, which is state as well as art and is left out.
  let nodeIds: number[] = [];
  try {
    nodeIds = fs.readdirSync(bbsRoot)
      .filter(entry => /^Node\d+$/.test(entry))
      .map(entry => parseInt(entry.slice(4), 10));
  } catch { /* no board here; the empty list is the answer */ }

  for (const id of nodeIds) {
    const screens = path.resolve(resolveNodeScreenDir(bbsRoot, id));
    if (screens !== path.resolve(bbsRoot, `Node${id}`)) roots.add(screens);
  }

  try {
    for (const id of conferenceNumbers(bbsRoot)) {
      roots.add(path.resolve(conferenceDir(bbsRoot, id), 'Screens'));
    }
  } catch { /* no conferences readable; the screens tree still stands */ }

  return [...roots];
}

/**
 * True when `target` is inside one of `roots`.
 *
 * A path question, not a string one: `<root>2/X` starts with `<root>` and
 * answering yes to that would hand one artist another's directory the moment
 * two slugs shared a prefix.
 */
export function isInside(roots: string[], target: string): boolean {
  const resolved = path.resolve(target);
  return roots.some(root => {
    const relative = path.relative(root, resolved);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });
}

/** Whether this account may write this board-relative path. */
export function mayWriteScreen(bbsRoot: string, writer: ScreenWriter, relativePath: string): boolean {
  const roots = writableRoots(bbsRoot, writer);
  if (roots.length === 0) return false;
  return isInside(roots, path.resolve(bbsRoot, relativePath));
}
