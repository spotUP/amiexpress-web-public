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

import { DEFAULT_SLUG, findTheme, isValidSlug, themeDirectory } from './theme-registry';
import { BBSPaths } from '../utils/bbs-paths.util';
import { readTooltypeMap } from '../utils/info-file.util';
import { conferenceDir } from '../conferences/conference-paths';

export {
  SCREEN_EXTENSIONS,
  isScreenFile,
  ScreenDirType,
  SCREEN_DIR_MAP,
} from './screen-tables';
import { ScreenDirType, SCREEN_DIR_MAP } from './screen-tables';


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
const nodeScreenDirCache = new Map<string, { stamp: number; dir: string }>();

export function resolveNodeScreenDir(baseDir: string, nodeId: number): string {
  const defaultDir = path.join(baseDir, `Node${nodeId}`);
  const infoPath = path.join(baseDir, `Node${nodeId}.info`);

  let stamp: number;
  try {
    stamp = fs.statSync(infoPath).mtimeMs;
  } catch {
    return defaultDir; // no icon, so no tooltype - express.e's ELSE branch
  }

  const cached = nodeScreenDirCache.get(infoPath);
  if (cached && cached.stamp === stamp) return cached.dir;

  let dir = defaultDir;
  try {
    const declared = (readTooltypeMap(infoPath).get('SCREENS') || '').trim();
    if (declared) {
      // checkPathSlash() in ACP.e guarantees a trailing slash on the Amiga
      // side; path.join here does its own separators, so strip it.
      const cleaned = declared.replace(/[\/]+$/, '');
      dir = cleaned.includes(':')
        ? new BBSPaths(baseDir).resolveAmigaPath(cleaned, nodeId)
        : path.resolve(baseDir, cleaned);
    }
  } catch (error) {
    // A corrupt icon must not take the node's screens away: fall back to the
    // directory express.e would have used with no tooltype at all.
console.error(`[loadScreenFile] could not read SCREENS from ${infoPath}: ${(error as Error).message}`);
    dir = defaultDir;
  }

  nodeScreenDirCache.set(infoPath, { stamp, dir });
  return dir;
}

/**
 * Get the actual screen file name for special screen types
 * Some screens use different file names (e.g., NODE_BULL -> BULL, CONF_BULL -> BULL)
 */
export function getScreenFileName(screenName: string): string {
  const upper = screenName.toUpperCase();
  // NODE_BULL and CONF_BULL both use 'BULL' as the file name
  if (upper === 'NODE_BULL' || upper === 'CONF_BULL') {
    return 'BULL';
  }
  // DOWNLOADMSG, UPLOADMSG -> DownloadMsg, UploadMsg
  if (upper === 'DOWNLOADMSG') return 'DownloadMsg';
  if (upper === 'UPLOADMSG') return 'UploadMsg';
  // express.e:6639-6641 — SCREEN_LOGON24 looks up 'Logon24hrs', not 'LOGON24'.
  // Sysops with original reference-board files use that name.
  if (upper === 'LOGON24') return 'Logon24hrs';
  return screenName;
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
export interface SearchLocation { dir: string; desc: string }

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
  return { dir, desc: `${entry.slug}: ${desc}` };
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
  } else if (dirType === ScreenDirType.CONF && opts.confId) {
    // express.e:31849 reads LOCATION.n for a conference's directory; deriving
    // `Conf<n>` from the number breaks the moment a board is renumbered, which
    // is how MENU went missing for the conference that moved into position 1.
    const confDir = conferenceDir(baseDir, opts.confId);
    // Keyed on the conference NUMBER, which is what this function is given and
    // what confIds() enumerates - not on the directory LOCATION.n names.
    const themed = theme(path.join('Conf', String(opts.confId)), `Conf/${opts.confId}`);
    if (themed) locations.push(themed);
    locations.push({ dir: confDir, desc: `Conf${opts.confId}` });
    locations.push({ dir: path.join(confDir, 'Screens'), desc: `Conf${opts.confId}/Screens` });
  } else if (dirType === ScreenDirType.GLOBAL) {
    const themed = theme('Board', 'Board');
    if (themed) locations.push(themed);
    locations.push({ dir: baseDir, desc: 'board root' });
    locations.push({ dir: path.join(baseDir, 'Screens'), desc: 'Screens' });
  }

  return locations;
}
