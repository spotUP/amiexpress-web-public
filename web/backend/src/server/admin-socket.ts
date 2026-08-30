/**
 * Whether a socket is an admin dashboard watching the board, rather than a
 * caller who should be given a node.
 *
 * The admin app asks for this with `?adminOnly=true`, but the query string is
 * a request and never the authority: the answer comes from the session the
 * JWT middleware attached to the socket. A non-sysop passing the flag gets the
 * ordinary BBS connection, not a privileged one.
 */

/** AmiExpress sysop level, the same threshold the HTTP admin routes require. */
export const SYSOP_SECURITY_LEVEL = 255;

export interface AdminSocketUser {
  id?: string | number;
  username?: string;
  secLevel?: number;
}

export interface AdminSocketDecision {
  /** True when the socket must skip node assignment and the welcome sequence. */
  serveAsAdmin: boolean;
  /** Rooms to join. Empty unless the socket is served as an admin. */
  rooms: string[];
  /** Set when the flag was asked for and refused, for the log line. */
  refusedReason?: string;
}

export function decideAdminSocket(
  query: Record<string, unknown> | undefined,
  user: AdminSocketUser | undefined
): AdminSocketDecision {
  if (query?.adminOnly !== 'true') {
    return { serveAsAdmin: false, rooms: [] };
  }

  if (typeof user?.secLevel !== 'number' || user.secLevel < SYSOP_SECURITY_LEVEL) {
    return {
      serveAsAdmin: false,
      rooms: [],
      refusedReason: `secLevel ${user?.secLevel ?? 'none'} is below ${SYSOP_SECURITY_LEVEL}`,
    };
  }

  // `admin` carries import progress, which has been emitted to an empty room
  // since it was written. `user:<id>` is what the operator chat handlers
  // address a specific sysop by.
  const rooms = ['admin'];
  if (user.id !== undefined && user.id !== null && String(user.id) !== '') {
    rooms.push(`user:${user.id}`);
  }

  return { serveAsAdmin: true, rooms };
}
