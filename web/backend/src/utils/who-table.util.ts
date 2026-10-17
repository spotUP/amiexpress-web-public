/**
 * express.e who(0) (express.e:24204-24384) - the node table. WHO prints it
 * for callers and NM prints it for the sysop before every "Which to change"
 * prompt (25295); both are the same procedure in express.e, so both read
 * their bytes from here.
 */

/** express.e:24217-24224: two blank lines, the top border, the header and its rule. */
export const WHO_TABLE_TOP: readonly string[] = [
  '\r\n',
  '\r\n',
  '\x1b[34m.---+---------------------+---------------------+---------------------+----.\x1b[0m\r\n',
  // express.e:24223. The blue starts after "Location   ", so the column's
  // last nine spaces are blue. The column is headed Group (b3f8b1113: the
  // caller's location is asked and shown as their Group).
  '\x1b[34m|\x1b[33mNd#\x1b[34m|\x1b[36m Name/Handle         \x1b[34m|\x1b[36m Group      \x1b[34m         |\x1b[36m Action              \x1b[34m|\x1b[36mChat\x1b[0m\x1b[34m|\x1b[0m\r\n',
  '\x1b[34m)---+---------------------+---------------------+---------------------+----(\x1b[0m\r\n',
];

/** express.e:24381-24383: the closing rule, the bottom border and a blank line. */
export const WHO_TABLE_BOTTOM: readonly string[] = [
  '\x1b[34m|---+---------------------+---------------------+---------------------+----|\x1b[0m\r\n',
  '\x1b[34m`--------------------------------------------------------------------------\'\x1b[0m\r\n',
  '\r\n',
];

/**
 * The Chat column: express.e:24255 chatstr through `\l\s[9]` (24260), which
 * pads the BYTES, escape included - "YES" gets one space, "NO" two, and both
 * fill the four columns under "Chat".
 */
export function whoChatColumn(chatEnabled: boolean): string {
  return chatEnabled ? '\x1b[32mYES ' : '\x1b[31mNO  ';
}

/**
 * who()'s SELECT status (express.e:24262-24369): the Action text for one
 * node and whether its Name/Group columns are printed. `hideFiles` is the
 * viewer's ACS_HIDE_FILES (24271, 24281); `isSelf` is `i=node` (24293).
 * Statuses that blank both columns print '' for name and location
 * (ACCOUNTSEQ 24326, NOTACTIVE 24352, AWAITCONNECT 24349, SHUTDOWN 24358,
 * SUSPEND 24362, RESERVE 24365, -1 and the DEFAULT 24366-24369).
 * Not ported: the DL:/UL: file name of a transfer (misc1, 24272, 24282) - a
 * web session records no transferred file name on the node.
 */
const WHO_ACTIONS: Record<number, string> = {
  0: 'IDLE', 4: 'READING MAIL', 5: 'REVIEWING STATS', 6: 'ACCOUNT EDITING', 7: 'ZOOMING',
  8: 'VIEWING DIRS', 9: 'READING BULLS', 10: 'VIEWING FILES', 11: 'ACCOUNT SEQUENCE',
  12: 'LOGGING OFF', 13: 'SYSOPING', 14: 'USING SHELL', 15: 'EDITING', 16: 'JOINING CONF',
  17: 'CHATTING', 18: 'NODE INACTIVE.', 19: 'REQUESTING CHAT', 20: 'CONNECTING',
  21: 'LOGGING ON', 22: 'AWAITING CONNECT', 23: 'SCANNING MAIL', 24: 'SHUTDOWN',
  25: 'MULTICHAT', 26: 'SUSPENDED', 27: 'RESERVED', 28: 'ONLINE MESSAGE',
};
const WHO_BLANK_NAME = new Set([11, 18, 22, 24, 26, 27]);

/**
 * WEB_: no express.e equivalent. A parked web session (dropped, inside its
 * resume window - server/session-parking.ts) keeps its node; its row keeps
 * the name and location and says this in the action column (19 wide,
 * express.e:24370 `\l\s[19]`). Express ends a call on carrier loss, so it
 * never has such a row.
 */
export const PARKED_ACTION = 'Detached';

export function whoEntry(status: number, name: string, location: string, ctx: { isSelf: boolean; hideFiles: boolean; parked: boolean }): { name: string; location: string; action: string } {
  let action: string;
  if (ctx.parked) return { name, location, action: PARKED_ACTION };
  if (status === 1) action = ctx.hideFiles ? 'DOWNLOADING' : 'BEGINNING DL';
  else if (status === 2) action = ctx.hideFiles ? 'UPLOADING' : 'BEGINNING UL';
  else if (status === 3) action = ctx.isSelf ? 'WHO' : 'MODULE';
  else action = WHO_ACTIONS[status] ?? '';
  const blank = WHO_BLANK_NAME.has(status) || !(status in WHO_ACTIONS) && status !== 1 && status !== 2 && status !== 3;
  return blank ? { name: '', location: '', action } : { name, location, action };
}

/**
 * express.e:24370: a node is listed when `status>=0` and it is not RESERVE (27),
 * SHUTDOWN (24) or NOTACTIVE (18) - unless the viewer has ACS_SYSOP_COMMANDS.
 */
export function whoListsNode(status: number, viewerIsSysop: boolean): boolean {
  return status >= 0 && (viewerIsSysop || (status !== 27 && status !== 24 && status !== 18));
}

/** `\l\s[19]`: left-justified in 19 columns, cut at 19. */
function field19(s: string): string {
  return s.substring(0, 19).padEnd(19);
}

/**
 * One node's row - express.e:24370-24375: mes2 (`\z\r\d[2]` node number),
 * mes (handle and location), mes1 (action and chat).
 */
export function whoRow(nodeId: number, name: string, location: string, action: string, chatEnabled: boolean): string {
  const nodeStr = String(nodeId).padStart(2, '0');
  return `\x1b[34m| \x1b[0m${nodeStr}\x1b[34m| \x1b[33m${field19(name)} \x1b[34m|\x1b[35m ${field19(location)} \x1b[34m|\x1b[0m ${field19(action)} \x1b[34m|${whoChatColumn(chatEnabled)}\x1b[34m|\x1b[0m\r\n`;
}
