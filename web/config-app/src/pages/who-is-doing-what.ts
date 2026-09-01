/**
 * Who is on, and what each of them is doing.
 *
 * The Activity feed answers "what happened". The question a sysop actually
 * asks is "what is Phantasm doing", and answering it from a feed means
 * scrolling and filtering - the more events the feed carries, the harder that
 * question gets, which is why more event types alone would have made this
 * worse rather than better.
 *
 * Two sources, already flowing, joined here:
 *   - `/api/nodes/status` - who is on which node and what state they are in
 *     RIGHT NOW, straight from the session map.
 *   - the live event stream - the last thing each of them actually did.
 *
 * Nothing is fetched for this. It is the two halves the page already holds.
 */

import { describeNodeActivity } from './node-activity';

export interface OnlineNodeLike {
  nodeId: number;
  online: boolean;
  username?: string;
  location?: string;
  currentActivity?: string;
  connectionType?: string;
  timeRemaining?: number;
}

export interface RecentEventLike {
  username: string;
  timestamp: number;
  detail: string;
}

export interface CallerActivity {
  nodeId: number;
  username: string;
  location: string;
  /** What they are doing now, in words. */
  doing: string;
  connectionType?: string;
  timeRemaining?: number;
  /** The last thing they did, if the feed has seen one. */
  lastDetail?: string;
  lastAt?: number;
}

/**
 * One row per caller, newest activity first.
 *
 * A node with no user is a connection that has not logged in; it takes no
 * row, the same rule listOnlineNodes uses on the server.
 */
export function whoIsDoingWhat(
  nodes: OnlineNodeLike[] | undefined,
  events: RecentEventLike[] | undefined,
): CallerActivity[] {
  const latest = new Map<string, RecentEventLike>();
  for (const event of events ?? []) {
    const key = (event.username ?? '').toLowerCase();
    if (!key) continue;
    const held = latest.get(key);
    // The feed is newest-first, but do not rely on it.
    if (!held || event.timestamp > held.timestamp) latest.set(key, event);
  }

  const rows: CallerActivity[] = [];
  for (const node of nodes ?? []) {
    if (!node.online || !node.username) continue;

    const last = latest.get(node.username.toLowerCase());
    rows.push({
      nodeId: node.nodeId,
      username: node.username,
      location: node.location ?? '',
      doing: describeNodeActivity(node.currentActivity) || 'Online',
      connectionType: node.connectionType,
      timeRemaining: node.timeRemaining,
      lastDetail: last?.detail || undefined,
      lastAt: last?.timestamp,
    });
  }

  // Whoever did something most recently first; a caller the feed has not seen
  // yet sorts by node so the list does not jump about.
  return rows.sort((a, b) => {
    if (a.lastAt && b.lastAt) return b.lastAt - a.lastAt;
    if (a.lastAt) return -1;
    if (b.lastAt) return 1;
    return a.nodeId - b.nodeId;
  });
}
