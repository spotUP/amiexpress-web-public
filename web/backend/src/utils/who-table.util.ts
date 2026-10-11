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
