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
import { isParked } from '../server/session-parking';
import type { OnlineNode } from '@amiexpress/bbs-door-sdk/core/types';

// The row shape is the SDK's, so a door and the board cannot disagree about
// it: it was declared `Promise<User[]>` there while this returned these rows.
export type { OnlineNode };

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
      /**
       * The SESSION's address first (divergence 34).
       *
       * `user.ip` is a field of the user RECORD and is empty for a telnet
       * or SSH caller, so the who's-online table - and the telnet front
       * end's "Your Telnet Login Established from Host" line, which reads
       * this list - said NOT AVAILABLE for exactly the two transports it
       * names. `session.remoteAddress` is populated for both
       * (telnet-server.ts, ssh-server.ts) and for web.
       *
       * express.e shows PRIVATE rather than a blank column.
       */
      ipAddress: String(
        (session as { remoteAddress?: string }).remoteAddress
          || user.ip
          || 'PRIVATE',
      ),
      status: isParked(session as { detachedAt?: number }) ? 'detached' : 'active',
    });
  }

  return online;
}
