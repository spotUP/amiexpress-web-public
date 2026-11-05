import { T } from '../door-theme';

/**
 * /whois - resolve and render a user's presence inline.
 *
 * The command (`commands/user.ts`) returns `{ type: 'whois', username }` and
 * nothing consumed it, so right-clicking Whois - which submits `/whois <name>`
 * - did nothing. Resolution has to happen where the online-user map lives (the
 * submit handler), because `CommandContext` only knows the CURRENT caller, not
 * the target. These two functions are pure so they are tested the way
 * `dm-render.formatDmLine` is; the handler wires them together.
 */

/** Find an online user by name (a leading `@` is optional), case-insensitive. */
export function findOnlineUser(users: Map<string, any>, name: string): any {
  const want = String(name).replace(/^@/, '').toLowerCase();
  for (const u of users.values()) {
    if (u && typeof u.username === 'string' && u.username.toLowerCase() === want) return u;
  }
  return undefined;
}

/**
 * The /whois line - the same facts the profile overlay shows (node, status),
 * rendered inline because a command prints to the log, not a dialog.
 */
export function formatWhois(user: any, name: string): string {
  const who = String(name).replace(/^@/, '');
  if (!user) return `{${T.alert}-fg}User ${who} is not online.{/${T.alert}-fg}`;
  const node = user.nodeId !== undefined && user.nodeId !== null && user.nodeId !== ''
    ? `Node ${user.nodeId}`
    : 'Node ?';
  const status = user.status === 'idle' ? 'idle' : user.status === 'away' ? 'away' : 'active';
  return `{${T.accent}-fg}${user.username || who}{/${T.accent}-fg} - ${node}, ${status}`;
}
