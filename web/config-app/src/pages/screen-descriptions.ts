/**
 * What each screen IS, in the sysop's terms.
 *
 * The board's names are the file names - CONF_BULL, JOINCONF, NODE_BULL - and
 * they answer "what is this called", never "when does a caller see it". Asked
 * directly: "i can't see the screen files that are shown when i join a
 * conference?" Both were on the page, under names that did not say so.
 *
 * Every name in the backend's SCREEN_DIR_MAP has an entry here, and
 * `screen-descriptions.test.ts` fails when one is added without a description.
 */

export const SCREEN_DESCRIPTIONS: Record<string, string> = {
  // Before and during logon
  AWAITSCREEN: 'Waiting for a caller, on the node itself',
  BBSTITLE: 'The first thing a caller sees on connecting',
  LOGON: 'Shown as a caller logs on, before the menu',
  LOGON24: 'Shown to a caller who has already called today',
  LOGOFF: 'Shown as a caller logs off',
  NEWUSERPW: 'Asks for the new-user password',
  NONEWUSERS: 'Shown when new users are not being accepted',
  GUESTLOGON: 'Shown to a caller logging on as guest',
  LOCKOUT0: 'Shown to a caller whose account is locked out',
  LOCKOUT1: 'The second lockout screen',
  NONEWATBAUD: 'New users refused at this connection speed',
  NOTTIME: 'Callers refused at this time of day',
  NOCALLERSAT: 'No callers accepted at this connection speed',
  ONENODE: 'Shown when every other node is busy',

  // Joining a conference
  JOIN: 'The conference list, shown when joining',
  JOINCONF: 'Shown when a caller joins without naming a conference',
  JOINED: 'Shown after a caller has joined a conference',
  JOINMSGBASE: 'The message base list, from the node directory',
  CONF_JOINMSGBASE: "Shown when choosing a message base in this conference",
  CONF_BULL: 'The bulletin a caller meets on joining THIS conference',
  MENU: "This conference's own menu",

  // Files, in a conference
  DOWNLOADMSG: 'Shown before a download in this conference',
  UPLOADMSG: 'Shown before an upload in this conference',
  NOUPLOADS: 'Shown when uploads are closed in this conference',
  FILEHELP: 'Help for the file area of this conference',

  // Board-wide
  BULL: 'The board bulletin, shown to every caller',
  NODE_BULL: "This node's own bulletin",
  PRIVATE: 'Shown when the board is private',
  MAILSCAN: 'Shown while mail is scanned',
  LANGUAGES: 'The language chooser',
  INTERNETNAMES: 'Explains the internet name prompt',
  REALNAMES: 'Explains the real name prompt',
};

/** The description, or an empty string for a screen this list has not met. */
export function describeScreen(screen: string): string {
  return SCREEN_DESCRIPTIONS[screen] ?? '';
}
