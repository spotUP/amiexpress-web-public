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

/**
 * WEB_BOT_DATA tokens - one secret per chatbot, minted by the sysop.
 *
 * `BOT_DATA_TOKENS="botid:secret,other:secret2:whip+board"` - comma
 * separated id:secret pairs with an optional third colon segment naming
 * the read domains the token may use, `+` (or space) separated (default:
 * all). Bearer sends the SECRET only. A token is a sysop-trusted
 * READER: every /api/bot/v1 route is a GET, and revocation is removing
 * the pair and restarting. Comparison is constant-time per candidate.
 */
export interface BOTServiceIdentity {
  id: string;
  /** Read domains allowed, null when all. */
  domains: string[] | null;
}

interface TokenEntry extends BOTServiceIdentity {
  secret: string;
}

export function parseBotServiceTokens(raw: string | undefined): TokenEntry[] {
  if (!raw) return [];
  const out: TokenEntry[] = [];
  for (const part of raw.split(',')) {
    const [id, secret, domains] = part.split(':').map((s) => s.trim());
    if (!id || !secret) continue;
    out.push({
      id,
      secret,
      domains: domains ? domains.split(/[\s+]/).filter(Boolean) : null,
    });
  }
  return out;
}

/** Guard for `/api/bot/v1/*`. Attaches req.botService on success. */
export function authenticateBotToken(req: Request, res: Response, next: NextFunction): void {
  const entries = parseBotServiceTokens(process.env.BOT_DATA_TOKENS);
  if (!entries.length) {
    res.status(401).json({ error: 'Bot data API not configured' });
    return;
  }
  const header = req.headers['authorization'];
  const presented = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
  const hit = entries.find((e) => tokensEqual(presented, e.secret));
  if (!presented || !hit) {
    res.status(401).json({ error: 'Invalid bot token' });
    return;
  }
  (req as any).botService = { id: hit.id, domains: hit.domains } as BOTServiceIdentity;
  next();
}

/** 403 when the token's domains exclude this one; open when unscoped. */
export function requireBotDomain(domain: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ident = (req as any).botService as BOTServiceIdentity | undefined;
    if (ident?.domains && !ident.domains.includes(domain)) {
      res.status(403).json({ error: `Token has no ${domain} scope` });
      return;
    }
    next();
  };
}
