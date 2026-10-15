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

/** A bot token entry is `id:secret` or `id:secret:domains`. Nothing else. */
const BOT_TOKEN_MAX_FIELDS = 3;

/**
 * The raw value already complained about, so a parse that runs on every
 * request does not write the same warning a thousand times.
 */
let warnedForRaw: string | null = null;

/** Test seam: forget what has already been warned about. */
export function resetBotTokenWarnings(): void {
  warnedForRaw = null;
}

/**
 * `,` separates entries and `:` separates an entry's fields, and there is no
 * escape for either, so a secret can contain neither. A secret with a `:` in
 * it used to be SILENTLY TRUNCATED at the first one - the board then
 * authenticated a shorter secret than the sysop configured, and the tail of
 * the real secret became a bogus domain scope. An entry that cannot be read
 * back is refused and named instead: a token nobody can parse must not
 * authenticate anybody, and the sysop has to be told which entry to fix.
 */
export function parseBotServiceTokens(raw: string | undefined): TokenEntry[] {
  if (!raw) return [];
  const out: TokenEntry[] = [];
  const problems: string[] = [];
  raw.split(',').forEach((part, index) => {
    const entry = part.trim();
    if (!entry) return;
    const where = `entry ${index + 1}`;
    const fields = entry.split(':').map((s) => s.trim());
    if (fields.length > BOT_TOKEN_MAX_FIELDS) {
      problems.push(
        `${where} has ${fields.length} colon-separated fields; an entry is id:secret or id:secret:domains, and a secret may contain neither ":" nor ","`
      );
      return;
    }
    const [id, secret, domains] = fields;
    if (!id) {
      problems.push(`${where} has no bot id`);
      return;
    }
    if (!secret) {
      problems.push(`${where} ("${id}") has no secret`);
      return;
    }
    out.push({
      id,
      secret,
      domains: domains ? domains.split(/[\s+]/).filter(Boolean) : null,
    });
  });
  if (problems.length && warnedForRaw !== raw) {
    warnedForRaw = raw;
    for (const problem of problems) {
      console.warn(`[BOT_DATA_TOKENS] ${problem} - entry ignored`);
    }
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
