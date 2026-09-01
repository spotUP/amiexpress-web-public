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
import { BBSPaths } from '../utils/bbs-paths.util';
import { readTooltypeMap } from '../utils/info-file.util';

export enum ScreenDirType {
  NODE = 'node',      // nodeScreenDir - Node{X}/ or Node{X}/Screens/
  CONF = 'conf',      // confScreenDir - Conf{X}/Screens/
  GLOBAL = 'global',  // cmds.bbsLoc - global Screens/ directory
}

/**
 * Map screen names to their directory type (express.e:6544-6640)
 * This is a 1:1 port of express.e displayScreen() CASE statements
 */
export const SCREEN_DIR_MAP: Record<string, ScreenDirType> = {
  // nodeScreenDir screens (express.e:6546-6634)
  'AWAITSCREEN': ScreenDirType.NODE,
  'NODE_BULL': ScreenDirType.NODE,  // SCREEN_NODE_BULL uses nodeScreenDir + 'BULL'
  'LOGOFF': ScreenDirType.NODE,
  'LOGON': ScreenDirType.NODE,
  'BBSTITLE': ScreenDirType.NODE,
  'JOIN': ScreenDirType.NODE,
  'JOINED': ScreenDirType.NODE,
  'JOINCONF': ScreenDirType.NODE,
  'JOINMSGBASE': ScreenDirType.NODE,
  'NEWUSERPW': ScreenDirType.NODE,
  'NONEWUSERS': ScreenDirType.NODE,
  'GUESTLOGON': ScreenDirType.NODE,
  'LOCKOUT0': ScreenDirType.NODE,
  'LOCKOUT1': ScreenDirType.NODE,
  'PRIVATE': ScreenDirType.NODE,

  // confScreenDir screens (express.e:6557-6608)
  'CONF_BULL': ScreenDirType.CONF,  // SCREEN_CONF_BULL uses confScreenDir + 'BULL'
  'MENU': ScreenDirType.CONF,
  'CONF_JOINMSGBASE': ScreenDirType.CONF,
  'DOWNLOADMSG': ScreenDirType.CONF,
  'FILEHELP': ScreenDirType.CONF,
  'UPLOADMSG': ScreenDirType.CONF,
  'NOUPLOADS': ScreenDirType.CONF,

  // cmds.bbsLoc screens (express.e:6548-6550, 6637-6640, 6615-6653)
  'BULL': ScreenDirType.GLOBAL,  // SCREEN_BULL uses cmds.bbsLoc + 'BULL'
  'ONENODE': ScreenDirType.GLOBAL,
  'LOGON24': ScreenDirType.GLOBAL,
  // express.e:6615-6653 - additional global screens
  'NONEWATBAUD': ScreenDirType.NODE,    // SCREEN_NONEWATBAUD: nodeScreenDir + 'NONEWAT' + baud
  'NOTTIME': ScreenDirType.NODE,        // SCREEN_NOT_TIME: nodeScreenDir + 'NOTTIME' + baud
  'NOCALLERSAT': ScreenDirType.NODE,    // SCREEN_NOCALLERSATBAUD: nodeScreenDir + 'NOCALLERSAT' + baud
  'LANGUAGES': ScreenDirType.GLOBAL,   // SCREEN_LANGUAGES: cmds.bbsLoc + 'Languages'
  'INTERNETNAMES': ScreenDirType.GLOBAL, // SCREEN_INTERNETNAMES: cmds.bbsLoc + 'InternetNames'
  'REALNAMES': ScreenDirType.GLOBAL,   // SCREEN_REALNAMES: cmds.bbsLoc + 'RealNames'
  'MAILSCAN': ScreenDirType.GLOBAL,    // SCREEN_MAILSCAN: cmds.bbsLoc + 'MailScan'
};

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

export function screenSearchLocations(
  baseDir: string,
  screenName: string,
  opts: { nodeId: number; confId?: number },
): SearchLocation[] {
  const locations: SearchLocation[] = [];
  const dirType = getScreenDirType(screenName);

  if (dirType === ScreenDirType.NODE) {
    const nodeDir = path.join(baseDir, `Node${opts.nodeId}`);
    const screenDir = resolveNodeScreenDir(baseDir, opts.nodeId);
    locations.push({
      dir: screenDir,
      desc: screenDir === nodeDir ? `Node${opts.nodeId}` : `Node${opts.nodeId} SCREENS tooltype`,
    });
  } else if (dirType === ScreenDirType.CONF && opts.confId) {
    locations.push({ dir: path.join(baseDir, `Conf${opts.confId}`), desc: `Conf${opts.confId}` });
    locations.push({ dir: path.join(baseDir, `Conf${opts.confId}`, 'Screens'), desc: `Conf${opts.confId}/Screens` });
  } else if (dirType === ScreenDirType.GLOBAL) {
    locations.push({ dir: baseDir, desc: 'board root' });
    locations.push({ dir: path.join(baseDir, 'Screens'), desc: 'Screens' });
  }

  return locations;
}
