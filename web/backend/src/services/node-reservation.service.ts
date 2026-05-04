/**
 * Per-node reservation service (audit A-3, full express.e parity).
 *
 * Backs the F4 sysop "Reserve for a user" toggle (express.e:7649-7656)
 * and the connect-time bump (express.e:28734-28738 / 29129-29135).
 *
 * State model
 * -----------
 * In-memory Map<nodeId, string>. The reservation is per-node, just like
 * express.e's `reservedName` global which lives in each node's address
 * space. Cleared on logoff (express.e:8213) and via the admin endpoint.
 *
 * The web admin route lets a sysop reserve a node *that is currently
 * offline* — express.e couldn't do that because F4 ran in the node's
 * own main loop, but the web variant has a global admin dashboard, so
 * we relax the live-session requirement and store the reservation
 * regardless. If the node is offline at set time, the reservation
 * still applies the next time someone connects.
 *
 * Match semantics
 * ---------------
 * `isReservationMatch` returns true when:
 *   - no reservation is set on that node (anyone can connect), OR
 *   - the supplied username matches the reservation case-insensitively
 *     (express.e:29131 / 28735 use StriCmp).
 * It returns false when a reservation is set and the supplied name is
 * empty / null / undefined / non-matching — so the caller can use a
 * single boolean check to decide whether to bump the connection.
 */

const reservations = new Map<number, string>();

/**
 * Set or clear a node's reservation. Empty / whitespace-only strings
 * clear the reservation (matches the express.e:7652-7653 F4 toggle
 * semantic where setting empty equals clearing).
 */
export function setNodeReservation(nodeId: number, username: string | null | undefined): void {
  const trimmed = (username ?? '').trim();
  if (trimmed.length === 0) {
    reservations.delete(nodeId);
    return;
  }
  reservations.set(nodeId, trimmed);
}

/**
 * Read the current reservation for a node. Returns null if unset.
 */
export function getNodeReservation(nodeId: number): string | null {
  return reservations.get(nodeId) ?? null;
}

/**
 * Clear a node's reservation. No-op if unset.
 *
 * Called on logoff (express.e:8213 StrCopy(reservedName,'')).
 */
export function clearNodeReservation(nodeId: number): void {
  reservations.delete(nodeId);
}

/**
 * Connect-time bump check (express.e:28734-28738 / 29131).
 * Returns true if the supplied username is allowed on this node:
 *   - true when no reservation is set on that node
 *   - true when the username matches the reservation case-insensitively
 *   - false when a reservation is set and the username is missing or non-matching
 */
export function isReservationMatch(nodeId: number, username: string | null | undefined): boolean {
  const reserved = reservations.get(nodeId);
  if (!reserved) return true;
  if (typeof username !== 'string' || username.length === 0) return false;
  return reserved.toLowerCase() === username.toLowerCase();
}

/**
 * Test-only: wipe all reservations. Production code should use
 * clearNodeReservation per node.
 */
export function resetAllNodeReservations(): void {
  reservations.clear();
}
