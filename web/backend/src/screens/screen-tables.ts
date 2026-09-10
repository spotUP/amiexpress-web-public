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
export const SCREEN_EXTENSIONS = [
  '.txt', '.gr', '.ibm', '.seq', '.rip', '.tti', '.ans', '.asc',
  /*
   * `.Header` and `.Tailer` are ART the board splices into a screen it writes
   * itself: `Screens/AchieveTop.Header` above the achievements leaderboard and
   * `.Tailer` below it, `Conf<n>/Conftop.Header` the same for the conference
   * top. The generated file between them is off limits - it is rewritten every
   * fifteen minutes - but these two are exactly the parts a designer owns, and
   * calling them "not screen files" meant nothing could list, open or draw
   * them. Asked for 2026-09-08: "start by making the achievement bulletins
   * editable and add support in the ansi studio".
   */
  '.header', '.tailer',
];

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
  // express.e:6076-6081 / 6232-6237: chat() opens with Node<n>/StartChat and
  // closes with Node<n>/EndChat - node screens, like LOGON.
  'STARTCHAT': ScreenDirType.NODE,
  'ENDCHAT': ScreenDirType.NODE,
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
  // Written by achievements/bulletin.ts, not by a sysop; shown at login
  // between NODE_BULL and the conference scan. Missing is the normal state.
  'ACHIEVETOP': ScreenDirType.GLOBAL,
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

  /*
   * This port's own, with no express.e line to cite.
   *
   * The board express.e was written for had no web signup and no privacy
   * notice; this one shows `Screens/PRIVACY.TXT` to every new caller
   * (handlers/user/new-user.handler.ts) and again on demand
   * (handlers/user/gdpr.handler.ts). Those read it by path, so no catalogue
   * name claimed it and the screen index called a screen every new caller
   * meets "read by nothing" - which the admin gallery then offered to an
   * artist as a file nobody wants.
   *
   * It belongs in THIS table rather than a second one beside it: the question
   * the table answers is what the board can display and from where, and two
   * tables are two answers that drift.
   */
  'PRIVACY': ScreenDirType.GLOBAL,
};

/**
 * Files the BOARD writes, by name.
 *
 * `AchieveTop.txt` is rewritten every fifteen minutes by
 * `achievements/bulletin.ts`, `quicknew.txt` by whichever door the sysop's
 * batch redirects into it, `CallersLog` and `lastc.txt` as callers come and
 * go. They live in screen directories and end in `.txt`, so nothing about
 * their shape says they are not art - but drawing one is drawing something
 * that is overwritten before the artist has closed the editor.
 *
 * It lives HERE, in the table with no I/O, because two readers need it and a
 * second copy is how they would come to disagree: the screen index (which
 * marks the FILES it finds `runtime`) and the studio's theme checklist (which
 * offers SLOTS for screens whose file does not exist yet, so it has nothing to
 * classify - only the name).
 */
export const BOARD_WRITTEN_NAME = /^(callerslog.*|lastc\.txt|achievetop\.txt|quicknew\.txt|.*\.log)$/i;

/** True when the board writes this file for itself, so no artist should draw it. */
export function isBoardWritten(fileName: string): boolean {
  return BOARD_WRITTEN_NAME.test(fileName);
}

/**
 * The file name a screen is stored under, when it differs from its catalogue
 * name (express.e:6544-6640).
 *
 * Moved here from `screen-resolution` so a browser can ask the question: the
 * resolver reaches for `fs` and `path`, and the admin needs this to tell an
 * artist which file to draw. Data has no dependencies; the resolver
 * re-exports it, so nothing that imported it from there has to change.
 */
export function getScreenFileName(screenName: string): string {
  const upper = screenName.toUpperCase();
  // NODE_BULL and CONF_BULL both use 'BULL' as the file name
  if (upper === 'NODE_BULL' || upper === 'CONF_BULL') return 'BULL';
  if (upper === 'DOWNLOADMSG') return 'DownloadMsg';
  if (upper === 'UPLOADMSG') return 'UploadMsg';
  // express.e:6639-6641 - SCREEN_LOGON24 looks up 'Logon24hrs', not 'LOGON24'.
  if (upper === 'LOGON24') return 'Logon24hrs';
  // This port's own: `achievements/bulletin.ts` writes `AchieveTop.txt` and
  // splices `AchieveTop.Header`/`.Tailer` around it. The loader finds a screen
  // case-insensitively, so the catalogue name worked - but anything that
  // BUILDS a path from it (the studio's checklist, offering the artist a place
  // to draw) wrote `ACHIEVETOP.Header`, which is not what the board reads.
  if (upper === 'ACHIEVETOP') return 'AchieveTop';
  return screenName;
}
