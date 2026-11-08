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

/** One PROFILE row from the federation door server, as the bridge forwards it. */
export interface ProfileReply {
  found: boolean;
  user: string;
  nick?: string;
  board?: string;
  status?: string;
  statusText?: string;
  firstSeen?: string;
  lastSeen?: string;
  idleSeconds?: string;
  online?: string;
  sharedRooms?: string;
}

function day(epochSeconds: string | undefined): string {
  const n = Number(epochSeconds);
  return n > 0 ? new Date(n * 1000).toISOString().slice(0, 10) : 'never';
}

/** The /whois text for a server profile; the same facts the overlay's extra lines show. */
export function profileLines(p: ProfileReply): string[] {
  if (!p.found) return [`{${T.alert}-fg}${p.user} is not known to the chat server.{/${T.alert}-fg}`];
  const online = p.online === '1';
  const status = online ? (p.status || 'online') : 'offline';
  const text = p.statusText ? ` - ${p.statusText}` : '';
  const lines = [
    `{${T.accent}-fg}${p.nick || p.user}{/${T.accent}-fg} @${p.board ?? '?'} - ${status}${text}`,
    online
      ? `  idle ${p.idleSeconds || '0'}s, first seen ${day(p.firstSeen)}`
      : `  last seen ${day(p.lastSeen)}, first seen ${day(p.firstSeen)}`,
  ];
  if (p.sharedRooms) lines.push(`  shared rooms: ${p.sharedRooms.split(',').length}`);
  return lines;
}

export function formatProfile(p: ProfileReply): string {
  return profileLines(p).join('\n');
}

/**
 * /whois asks the server and waits for chat:profile. A board without the
 * federation never answers, so each request carries a fallback that runs
 * after `ms` unless the reply arrives first.
 */
export class WhoisRequests {
  private pending = new Map<string, ReturnType<typeof setTimeout>>();
  ask(name: string, fallback: () => void, ms = 1500): void {
    const k = name.replace(/^@/, '').toLowerCase();
    const old = this.pending.get(k);
    if (old) clearTimeout(old);
    this.pending.set(k, setTimeout(() => { this.pending.delete(k); fallback(); }, ms));
  }
  /** The reply arrived: true when a request was waiting for it (fallback cancelled). */
  answer(user: string): boolean {
    const bare = user.split('@')[0].toLowerCase();
    for (const [k, t] of this.pending) {
      if (k === user.toLowerCase() || k === bare) {
        clearTimeout(t);
        this.pending.delete(k);
        return true;
      }
    }
    return false;
  }
}

export const whoisRequests = new WhoisRequests();

/**
 * The profile overlay claims the next chat:profile reply for its target.
 * Return true from the sink when the reply was consumed (not printed to the log).
 */
let profileSink: ((p: ProfileReply) => boolean) | null = null;
export function setProfileSink(sink: ((p: ProfileReply) => boolean) | null): void { profileSink = sink; }
export function offerProfile(p: ProfileReply): boolean { return profileSink ? profileSink(p) : false; }
