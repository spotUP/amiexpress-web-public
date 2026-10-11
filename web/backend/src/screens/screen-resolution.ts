/**
 * Where AmiExpress reads a screen from - the table, and nothing else.
 *
 * express.e:6544-6640 picks ONE directory per screen type and gives up if the
 * file is not there. There is no cross-directory fallback, and a screen this
 * port finds where a real Amiga would not is a parity bug rather than a
 * feature.
 *
 * This lived inside screen.handler.ts, private, which meant anything else
 * needing to know where a screen comes from had to re-derive it. A writer and
 * a reader each holding their own copy of one rule is the fault behind the
 * whole 2026-08-31 admin audit: both halves work, on data that never meets.
 * The BBS loader and the admin's screen file manager both read this module.
 */

import * as fs from 'fs';
import * as path from 'path';

import { DEFAULT_SLUG, THEME_FILES_DIR, findTheme, isValidSlug, themeDirectory } from './theme-registry';
import { isBoardGeneratedFile } from './generated-screens';
import { BBSPaths } from '../utils/bbs-paths.util';
import { readTooltypeMap } from '../utils/info-file.util';
import * as amigafs from '../utils/amigafs';
import { conferenceDir } from '../conferences/conference-paths';

export {
  SCREEN_EXTENSIONS,
  isScreenFile,
  ScreenDirType,
  SCREEN_DIR_MAP,
} from './screen-tables';
import { ScreenDirType, SCREEN_DIR_MAP, THEME_WIDE_DIR, getScreenFileName, isThemeWideScreen } from './screen-tables';
export { getScreenFileName };


/**
 * express.e's `nodeScreenDir` (express.e:96, assigned at :31995 from
 * `sopt.nodeScreens`).
 *
 * ACP.e:2666-2673 fills that field: the node's `SCREENS` tooltype when
 * `Node<N>.info` declares one, and `<bbsLoc>/Node<N>/` when it does not.
 * That tooltype is how a board with more nodes than screen directories works
 * on a real Amiga - many nodes point at ONE directory instead of each
 * carrying a copy. Without it, this port could only serve the nodes that had
 * a directory of their own, which on a 255-node board is most of them
 * missing.
 *
 * The result is cached against the icon's mtime: a screen load must not read
 * and parse an .info file every time, and a sysop who edits the tooltype
 * gets the new directory on the next load without a restart.
 */
const nodeScreenDirCache = new Map<string, { stamp: number; dir: string; seenIn: number }>();

/**
 * The screen directory an icon's `SCREENS` tooltype names, or `defaultDir`.
 *
 * ONE body for both scopes, because express.e has one rule. A node's
 * directory comes from `Node<n>.info` (ACP.e:2666-2673) and a conference's
 * from `Conf<n>.info` (express.e:5052-5054), and both are "the default unless
 * the icon says otherwise" with the same trailing-slash handling, the same
 * assign resolution and the same "a corrupt icon loses you nothing" fallback.
 * Two copies of that would drift the first time one of them was fixed.
 *
 * `assignNode` is the node an Amiga assign like `NODE:` resolves against. A
 * conference's tooltype has no node of its own, and every real one names
 * `BBS:`, so it passes the caller's node through rather than inventing one.
 */
function screenDirFromIcon(
  baseDir: string,
  infoPath: string,
  defaultDir: string,
  assignNode: number,
): string {
  /*
   * Inside one snapshot the icon is checked ONCE.
   *
   * The cache below validates itself with a statSync on every call, which is
   * right for a long-lived process and wasteful inside a screen-index build:
   * this is asked once per screen per node, and it came to 1,058 stats of one
   * build on this board (measured 2026-09-14). `withStableListings` already
   * means "one pass, one view of the disk", and this is the same promise
   * applied to the same question - re-checked in the next snapshot, so a
   * sysop who edits the tooltype still gets it without a restart.
   */
  const snap = amigafs.currentSnapshot();
  const held = nodeScreenDirCache.get(infoPath);
  if (snap !== 0 && held && held.seenIn === snap) return held.dir;

  let stamp: number;
  try {
    stamp = fs.statSync(infoPath).mtimeMs;
  } catch {
    /*
     * NO ICON IS AN ANSWER, and it has to be remembered like any other.
     *
     * Most nodes on this board have no `Node<N>.info` at all, so this branch
     * is the common one - and caching only the POSITIVE answer meant every
     * one of them stat'd a file that was not there, once per screen, for 898
     * stats of a single index build (measured 2026-09-14). Within a snapshot
     * "there is no icon" is as stable as "here is the icon".
     */
    nodeScreenDirCache.set(infoPath, { stamp: -1, dir: defaultDir, seenIn: snap });
    return defaultDir; // no icon, so no tooltype - express.e's ELSE branch
  }

  const cached = nodeScreenDirCache.get(infoPath);
  if (cached && cached.stamp === stamp) {
    cached.seenIn = snap;
    return cached.dir;
  }

  let dir = defaultDir;
  try {
    const declared = (readTooltypeMap(infoPath).get('SCREENS') || '').trim();
    if (declared) {
      // checkPathSlash() in ACP.e guarantees a trailing slash on the Amiga
      // side; path.join here does its own separators, so strip it.
      const cleaned = declared.replace(/[\/]+$/, '');
      dir = cleaned.includes(':')
        ? new BBSPaths(baseDir).resolveAmigaPath(cleaned, assignNode)
        : path.resolve(baseDir, cleaned);
    }
  } catch (error) {
    // A corrupt icon must not take the screens away: fall back to the
    // directory express.e would have used with no tooltype at all.
console.error(`[loadScreenFile] could not read SCREENS from ${infoPath}: ${(error as Error).message}`);
    dir = defaultDir;
  }

  nodeScreenDirCache.set(infoPath, { stamp, dir, seenIn: snap });
  return dir;
}

/** The directory a node reads its screens from (ACP.e:2666-2673). */
export function resolveNodeScreenDir(baseDir: string, nodeId: number): string {
  return screenDirFromIcon(
    baseDir,
    path.join(baseDir, `Node${nodeId}.info`),
    path.join(baseDir, `Node${nodeId}`),
    nodeId,
  );
}

/**
 * The directory a CONFERENCE reads its screens from.
 *
 * express.e:5052-5054, run on every join:
 *
 *     StrCopy(confScreenDir,currentConfDir)
 *     readToolType(TOOLTYPE_CONF,conf,'SCREENS',confScreenDir)
 *
 * The conference's own directory is the DEFAULT and the tooltype overrides it,
 * exactly as a node's does. This port read the node's and ignored the
 * conference's, so a board could not do the thing AmiExpress offers: point
 * every conference at one directory and keep ONE menu instead of fourteen
 * ("i only need one main menu for the users and one for the sysops", the
 * sysop, 2026-09-17).
 *
 * The default comes from `conferenceDir`, which reads `LOCATION.n` - never
 * `Conf<n>` built from the number. Conference 1 on this board lives in
 * `Conf2`, and arithmetic here would serve the screens of a conference that
 * was deleted.
 */
export function resolveConfScreenDir(baseDir: string, confId: number, nodeId = 0): string {
  return screenDirFromIcon(
    baseDir,
    path.join(baseDir, `Conf${confId}.info`),
    conferenceDir(baseDir, confId),
    nodeId,
  );
}

/**
 * Get screen directory type from screen name
 * Returns the directory type for known screens, or null for unknown screens
 */
export function getScreenDirType(screenName: string): ScreenDirType | null {
  const upper = screenName.toUpperCase();
  return SCREEN_DIR_MAP[upper] || null;
}

/**
 * The directories express.e would search for one screen, in its order.
 *
 * express.e:6546-6653 - a NODE screen comes from nodeScreenDir alone, a CONF
 * screen from the conference, and a GLOBAL screen from cmds.bbsLoc (the board
 * root). Screens/ trails the board root only until the files that live there
 * are moved; it is not a fallback for the other two scopes.
 */
export interface SearchLocation {
  dir: string;
  desc: string;
  /**
   * Set on a THEME's directory, never on the board's own.
   *
   * The theme is an overlay: it answers first, and what it answers for is
   * still there underneath for every caller not wearing it. The index has to
   * tell the two apart, or a board screen a theme covers is reported as read
   * by nothing - which is what the sysop was told about their own main menus.
   */
  themed?: true;
}

/**
 * The theme's mirror of one scope, when the theme has that directory.
 *
 * The tree is keyed on the SCOPE the loader computed, never on the directory
 * the board happens to keep that scope in: a node's screen directory is
 * whatever its SCREENS tooltype says and a conference's is what LOCATION.n
 * names, so a theme mirroring those names would break the first time a board
 * was renumbered or a node's icon was edited.
 *
 * A theme directory that does not exist is dropped, the way
 * `listScreenDirectories` drops a missing directory. Only THEME entries are
 * filtered - the board's own are returned unconditionally, exactly as before,
 * because checking them would change what the no-theme case returns and the
 * byte-identity pin forbids that.
 */
function themeLocation(
  baseDir: string,
  themeSlug: string | undefined,
  scope: string,
  desc: string,
): SearchLocation | null {
  if (!themeSlug || themeSlug === DEFAULT_SLUG) return null;
  if (!isValidSlug(themeSlug)) return null;

  const entry = findTheme(baseDir, themeSlug);
  // A slug with no registry entry is not a theme. Resolving it against a
  // directory anyway would let a query parameter name any directory on the
  // volume as a screen source.
  if (!entry) return null;

  const root = themeDirectory(baseDir, entry);
  // `default` has no directory by design, and any other entry with an empty
  // DIR is refused by the registry reader before it reaches here.
  if (!root) return null;

  const dir = path.join(root, scope);
  if (!fs.existsSync(dir)) return null;
  return { dir, desc: `${entry.slug}: ${desc}`, themed: true };
}

/**
 * The theme's mirror of one board-relative path, for the arms of the loader
 * that never reach the directory list.
 *
 * `loadScreenFile` has three arms that push a finished path and skip
 * `screenSearchLocations` entirely: an absolute filesystem path, an Amiga
 * assign, and a slash-bearing relative path. That is how a bulletin arrives
 * (`display-file-commands.handler.ts` runs the security walk itself and hands
 * over what it found), how `~SS_` arrives, and how `~SR_` arrives once it has
 * resolved `BBS:`/`WORK:`/`SCREENS:`. Without a mirror, a themed board serves
 * the board's bulletins and the board's pool art whatever the artist drew.
 *
 * `Themes/<slug>/Files/` mirrors the board root VERBATIM, so
 * `~SS_BBS:Screens/subhead.txt` finds `Themes/neon/Files/Screens/subhead.txt`
 * when the theme carries one and the board's own file when it does not.
 *
 * Two limits, both deliberate:
 *
 * - A path outside the board root has no mirror. A theme is the board's art,
 *   not a redirection primitive for the whole filesystem.
 * - A theme may REPLACE a file the board already has by that path and may not
 *   introduce one it does not. That falls out of the shape rather than being
 *   enforced here: by the time the loader sees a bulletin or a pool member,
 *   the caller has ALREADY chosen the path from the board's own files, so a
 *   number or a security variant the board lacks is never asked for.
 *
 * And one limit that IS enforced: a file the board writes for itself has no
 * mirror. A theme's copy of a door's bulletin is that bulletin frozen on the
 * day it was copied, and the mirror is offered first - so `Themes/h7/Files/
 * Bulletins/bull9.txt` served the REQUESTS list as it stood on 2026-09-12 to
 * every h7 caller for a month. `isBoardGeneratedFile` is the same rule that
 * keeps such a file out of a seeded theme.
 */
export function themedPath(
  baseDir: string,
  themeSlug: string | undefined,
  absPath: string,
): string | null {
  if (!themeSlug || themeSlug === DEFAULT_SLUG) return null;
  if (!isValidSlug(themeSlug)) return null;
  if (!path.isAbsolute(absPath)) return null;

  const entry = findTheme(baseDir, themeSlug);
  if (!entry) return null;
  const root = themeDirectory(baseDir, entry);
  if (!root) return null;

  const rel = path.relative(path.resolve(baseDir), path.resolve(absPath));
  // Outside the board root, or the root itself: no mirror.
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  // A path already inside the theme has no second mirror - `Files/Themes/...`
  // is a directory no artist means to fill.
  if (path.resolve(absPath).startsWith(path.resolve(root) + path.sep)) return null;
  if (isBoardGeneratedFile(baseDir, absPath)) return null;

  return path.join(root, THEME_FILES_DIR, rel);
}

export function screenSearchLocations(
  baseDir: string,
  screenName: string,
  opts: { nodeId: number; confId?: number; themeSlug?: string },
): SearchLocation[] {
  const locations: SearchLocation[] = [];
  const dirType = getScreenDirType(screenName);
  const theme = (scope: string, desc: string) =>
    themeLocation(baseDir, opts.themeSlug, scope, desc);

  if (dirType === ScreenDirType.NODE) {
    const nodeDir = path.join(baseDir, `Node${opts.nodeId}`);
    const screenDir = resolveNodeScreenDir(baseDir, opts.nodeId);
    // One `Node/` for every node: 24 nodes on this board read the same art,
    // and an artist redraws the board once, not once per node.
    const themed = theme('Node', 'Node');
    if (themed) locations.push(themed);
    locations.push({
      dir: screenDir,
      desc: screenDir === nodeDir ? `Node${opts.nodeId}` : `Node${opts.nodeId} SCREENS tooltype`,
    });
    /*
     * THE SHARED NODE DIRECTORY, LAST, and it is not a second guess at the
     * tooltype - it is the floor under a node that has no art of its own.
     *
     * The image COLLAPSES node screens: 544 files that were 16 distinct
     * screens move into `Screens/Node/` and each `Node<n>.info` is given
     * `SCREENS=BBS:Screens/Node/` (Dockerfile, collapse-default-screens.ts).
     * A board built after that reads the shared directory and nothing is
     * missing. A board built BEFORE it - this one - keeps node icons with no
     * such tooltype, so `resolveNodeScreenDir` answers `Node<n>/`, and every
     * screen the image now ships only in the shared directory is invisible to
     * it. The 239 generated PETSCII screens landed there and no C64 caller
     * could reach one until 71 node directories were mirrored BY HAND
     * (2026-09-16), which fixes the nodes that exist and not the next one the
     * board creates.
     *
     * Ordered AFTER the node's own directory, so nothing is shadowed: a node
     * with its own `BBSTITLE.SEQ` keeps it, and only a screen the node does
     * not have falls through to the one every node shares. Skipped when the
     * tooltype already points here, which is the collapsed board's case.
     */
    const sharedNodeDir = path.join(baseDir, 'Screens', 'Node');
    if (path.resolve(sharedNodeDir) !== path.resolve(screenDir)) {
      locations.push({ dir: sharedNodeDir, desc: 'Screens/Node (shared)' });
    }
  } else if (dirType === ScreenDirType.CONF && opts.confId) {
    // express.e:31849 reads LOCATION.n for a conference's directory; deriving
    // `Conf<n>` from the number breaks the moment a board is renumbered, which
    // is how MENU went missing for the conference that moved into position 1.
    const ownDir = conferenceDir(baseDir, opts.confId);
    // express.e:5053 lets `Conf<n>.info` send the conference somewhere else,
    // exactly as a node's icon does - which is how ONE menu can serve every
    // conference instead of fourteen copies drifting apart.
    const screenDir = resolveConfScreenDir(baseDir, opts.confId, opts.nodeId);
    // Keyed on the conference NUMBER, which is what this function is given and
    // what confIds() enumerates - not on the directory LOCATION.n names.
    const themed = theme(path.join('Conf', String(opts.confId)), `Conf/${opts.confId}`);
    if (themed) locations.push(themed);
    /*
     * THE THEME'S ONE MENU, for every conference it has not drawn on its own.
     *
     * After the conference's own theme directory (an override wins) and before
     * the board's directories, so a theme's main menu covers the board's in
     * every conference. Only ever a THEME location: `theme()` answers null
     * without one, so the board's own list is express.e's, unchanged. See
     * THEME_WIDE_SCREENS for why only MENU.
     */
    if (isThemeWideScreen(screenName)) {
      const wide = theme(THEME_WIDE_DIR, `${THEME_WIDE_DIR} (every conference)`);
      if (wide) locations.push(wide);
    }
    locations.push({
      dir: screenDir,
      desc: path.resolve(screenDir) === path.resolve(ownDir)
        ? `Conf${opts.confId}`
        : `Conf${opts.confId} SCREENS tooltype`,
    });
    // The conference's own `Screens/` stays under its directory, and is only
    // meaningful when the tooltype has not sent the conference elsewhere.
    if (path.resolve(screenDir) === path.resolve(ownDir)) {
      locations.push({ dir: path.join(ownDir, 'Screens'), desc: `Conf${opts.confId}/Screens` });
    }
    /*
     * THE SHARED CONFERENCE DIRECTORY, LAST, and it is the floor under a
     * conference with no menu of its own - the same shape as `Screens/Node`
     * above, for the same reason.
     *
     * Ordered after the conference's own directory, so nothing is shadowed: a
     * conference that keeps its own MENU keeps it, and only a screen it does
     * not have falls through to the one every conference shares. Skipped when
     * the tooltype already points here.
     */
    const sharedConfDir = path.join(baseDir, 'Screens', 'Conf');
    if (path.resolve(sharedConfDir) !== path.resolve(screenDir) && fs.existsSync(sharedConfDir)) {
      locations.push({ dir: sharedConfDir, desc: 'Screens/Conf (shared)' });
    }
  } else if (dirType === ScreenDirType.GLOBAL) {
    const themed = theme('Board', 'Board');
    if (themed) locations.push(themed);
    locations.push({ dir: baseDir, desc: 'board root' });
    locations.push({ dir: path.join(baseDir, 'Screens'), desc: 'Screens' });
  }

  return locations;
}
