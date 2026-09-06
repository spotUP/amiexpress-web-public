/**
 * WHAT a screen is, and WHERE it comes from - the tables, with no I/O.
 *
 * Split out of screen-resolution.ts so a reader can have the table without
 * having Node. The admin app cross-checks that every screen the board can
 * display has a description on its screens page, and importing the resolver to
 * get the table pulled `fs`, `path` and everything they reach into a BROWSER
 * bundle's type-check - which is what turned CI red (2026-09-06: forty
 * type errors in web/config-app, none of them about the admin app).
 *
 * Data has no dependencies, so it does not need a process to be read in. The
 * resolver re-exports all of this, so nothing that imported it from there has
 * to change, and there is still exactly one copy of the table.
 */

/**
 * The extensions the loader will accept for a screen (ScreenTypes.info plus
 * this port's own).
 *
 * This lived inside screen-index.service.ts. It belongs beside the rest of
 * "where a screen comes from": the admin's index is no longer the only reader
 * - the image's seed step has to know which files in a node directory are
 * screens before it can share them, and a second copy of the list is how the
 * two would come to disagree about `.asc`.
 */
export const SCREEN_EXTENSIONS = ['.txt', '.gr', '.ibm', '.seq', '.rip', '.ans', '.asc'];

export function isScreenFile(name: string): boolean {
  if (name.endsWith('.backup')) return false;
  const lower = name.toLowerCase();
  // `bbsConfig.info.txt` is a config file's text sidecar, not a screen - it
  // ends in .txt and has nothing to do with what a caller sees.
  if (lower.endsWith('.info') || lower.includes('.info.')) return false;
  return SCREEN_EXTENSIONS.some(ext => lower.endsWith(ext));
}

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
