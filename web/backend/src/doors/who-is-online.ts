/**
 * Who is on the board, in one place.
 *
 * The telnet front end asked for this over Socket.IO: it called
 * `socket.emit('get-active-users')` and waited 150ms for an `active-users`
 * reply. That reply never came and never could. A door runs INSIDE the
 * backend and the socket it holds is the user's own server-side socket, so
 * `emit` sends the event OUT to the browser - which has no listener for it -
 * while the backend's own `socket.on('get-active-users')` only ever fires
 * when a CLIENT asks, and no client does. Both halves were dead: the door
 * timed out every single time and drew a table of "Awaiting Call"
 * placeholders, and the handler answering it had no caller at all.
 *
 * The door does not need a round trip. It is in the same process as the
 * session map. This is that read, defined once so the socket API and the
 * door cannot describe "online" differently.
 */

import { sessions } from '../server/session-manager';

export interface OnlineNode {
  nodeNumber: number;
  username: string;
  location: string;
  ipAddress: string;
  status: 'active';
}

/**
 * The nodes with a logged-in user on them.
 *
 * A session with no `user` is a connection that has not logged in yet, and a
 * session with no `nodeId` has no row to sit on; neither is "online" for a
 * who's-online display.
 */
export function listOnlineNodes(): OnlineNode[] {
  const online: OnlineNode[] = [];

  for (const session of sessions.values()) {
    const user = (session as { user?: Record<string, unknown> }).user;
    const nodeId = (session as { nodeId?: number }).nodeId;
    if (!user || nodeId === undefined) continue;

    online.push({
      nodeNumber: nodeId,
      username: String(user.username ?? 'Unknown'),
      location: String(user.location ?? ''),
      // express.e shows PRIVATE rather than a blank column.
      ipAddress: String(user.ip ?? 'PRIVATE'),
      status: 'active',
    });
  }

  return online;
}
