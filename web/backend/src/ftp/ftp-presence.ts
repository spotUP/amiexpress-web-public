/**
 * Who is on the board over FTP.
 *
 * `WHO` enumerates the BBS session map, and an FTP caller is not in it: he
 * holds a NODE - taken from the same node manager, counted against the same
 * pool, refused with "all nodes are busy" like anybody else - but he has no
 * `BBSSession`, no socket and no substate. So a sysop looking at WHO sees a
 * node missing from the list and no idea who has it.
 *
 * This is the smallest thing that fixes that: a registry the FTP wiring writes
 * when it takes a node and clears when it gives one back, and which `WHO`
 * reads alongside its own sessions. It is deliberately NOT a second session
 * store - it holds a name, a location and a node, which is what the WHO table
 * has columns for.
 */

export interface FtpPresence {
  nodeId: number;
  username: string;
  location: string;
  /** When the caller logged in, so a long-running transfer is visible as one. */
  since: Date;
}

const online = new Map<string, FtpPresence>();

/** Called when an FTP caller takes a node. */
export function registerFtpCaller(
  sessionId: string,
  presence: Omit<FtpPresence, 'since'>
): void {
  online.set(sessionId, { ...presence, since: new Date() });
}

/**
 * Called when he gives it back - QUIT, a dropped connection, or a board that
 * closed the session. Idempotent: a session that was never registered (a
 * login that failed before a node was assigned) releases nothing.
 */
export function releaseFtpCaller(sessionId: string): void {
  online.delete(sessionId);
}

/** Everyone on over FTP right now, for WHO. */
export function ftpCallersOnline(): FtpPresence[] {
  return Array.from(online.values()).sort((a, b) => a.nodeId - b.nodeId);
}

/** Test seam: forget everyone. Never called by the board. */
export function resetFtpPresence(): void {
  online.clear();
}
