/**
 * Service-token auth (WHIP mirror bot).
 *
 * The bot is a service, not a user: it authenticates with a shared secret
 * (`WHIP_SERVICE_TOKEN`) instead of a JWT. Comparison is constant-time so a
 * wrong token takes the same path as a right one.
 */

import { timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';

export function getServiceToken(): string {
  return process.env.WHIP_SERVICE_TOKEN ?? '';
}

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Guard for `/api/whip/*`. 401 when the token is absent or wrong, and also
 * when the server itself has none configured — an unconfigured server must
 * refuse service clients, not admit them.
 */
export function authenticateServiceToken(req: Request, res: Response, next: NextFunction): void {
  const configured = getServiceToken();
  if (!configured) {
    res.status(401).json({ error: 'Service auth not configured' });
    return;
  }
  const header = req.headers['authorization'];
  const presented = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!presented || !tokensEqual(presented, configured)) {
    res.status(401).json({ error: 'Invalid service token' });
    return;
  }
  next();
}
