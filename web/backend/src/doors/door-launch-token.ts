/**
 * A token the DoorRepo door presents when it asks this BBS to do something.
 *
 * The door is 68K code running under the emulator: it never sees the
 * backend's environment, so the token is written where it already reads its
 * configuration - `Doors/DoorRepo/DoorRepo.token`, Latin-1, one line.
 *
 * Minted per launch and held in memory only. A door management API reachable
 * at bbs.uprough.net without one would be a remote door-wipe button, and this
 * board has already lost its whole Doors/ tree once.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface LaunchTokenClaims {
  nodeId: string;
  userId: number;
  secLevel: number;
}

const live = new Map<string, LaunchTokenClaims>();

export function mintLaunchToken(
  bbsRoot: string,
  session: { nodeId: number | string; userId: number; secLevel: number }
): string {
  const nodeId = String(session.nodeId);

  // One token per node: a new launch invalidates the previous one, so a
  // token left in a stale file cannot be replayed.
  for (const [existing, claims] of live) {
    if (claims.nodeId === nodeId) live.delete(existing);
  }

  const token = crypto.randomBytes(24).toString('hex');
  live.set(token, { nodeId, userId: session.userId, secLevel: session.secLevel });

  const tokenPath = path.join(bbsRoot, 'Doors', 'DoorRepo', 'DoorRepo.token');
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  // 0600: the token is a bearer credential for a delete-capable API, and it
  // has to live in the door's own directory because a C89 door reads it with
  // fgets. Narrow what can read it to the account the BBS runs as.
  fs.writeFileSync(tokenPath, `${token}\n`, { encoding: 'latin1', mode: 0o600 });
  try {
    fs.chmodSync(tokenPath, 0o600);
  } catch {
    // A filesystem without POSIX modes (a FAT-mounted volume, some Windows
    // setups) cannot narrow this; the token is still per-launch and revoked
    // when the door exits.
  }

  return token;
}

export function verifyLaunchToken(token: string | undefined): LaunchTokenClaims | null {
  if (!token) return null;
  const claims = live.get(token);
  return claims ? { ...claims } : null;
}

export function revokeLaunchToken(token: string): void {
  live.delete(token);
}
