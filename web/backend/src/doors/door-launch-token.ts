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
  fs.writeFileSync(tokenPath, `${token}\n`, 'latin1');

  return token;
}

export function verifyLaunchToken(token: string | undefined): LaunchTokenClaims | null {
  if (!token) return null;
  return live.get(token) ?? null;
}

export function revokeLaunchToken(token: string): void {
  live.delete(token);
}
