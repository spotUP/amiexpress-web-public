/**
 * RESUME TOKENS - the key a phone shows to get its parked session back.
 *
 * 32 random bytes, base64url. The server keeps only sha256(token), in memory
 * (a parked session is in memory, so a persisted token would outlive what it
 * opens). Bound to the session OBJECT, its user id and node id. Rotated on
 * every resume, revoked when the session ends by any path. It never creates a
 * session: a token whose session is gone opens nothing.
 *
 * The token must never reach a logger, a trace or an error message; logs carry
 * `tokenFingerprint` (the first 8 hex of the hash) instead.
 */
import * as crypto from 'crypto';

export interface ResumeBound { session: object; userId: string; nodeId: number }
export type ResumeLookup = { ok: true; bound: ResumeBound } | { ok: false; reason: 'unknown' | 'expired' };
interface Rec extends ResumeBound { hash: string; expiresAt: number | null }

const byHash = new Map<string, Rec>();
const bySession = new WeakMap<object, Rec>();
const hashOf = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

/** 8 hex chars of the hash: safe for logs, useless for opening anything. */
export function tokenFingerprint(token: string): string { return hashOf(token).slice(0, 8); }

/** Issue a token for a session, replacing any token it had. */
export function issueResumeToken(session: object, userId: string, nodeId: number): string {
  revokeResumeToken(session);
  const token = crypto.randomBytes(32).toString('base64url');
  const rec: Rec = { hash: hashOf(token), session, userId: String(userId), nodeId, expiresAt: null };
  byHash.set(rec.hash, rec);
  bySession.set(session, rec);
  return token;
}

/** A resume swaps the token: the old one stops working at once. */
export function rotateResumeToken(session: object): string {
  const rec = bySession.get(session);
  if (!rec) throw new Error('rotate: session has no resume token');
  return issueResumeToken(session, rec.userId, rec.nodeId);
}

/**
 * Lookup is by the sha256 of the offered token in a Map. The offered value is
 * hashed first, so what is compared is never the secret itself and the lookup
 * time does not depend on how many leading characters match.
 */
export function lookupResumeToken(token: unknown, now: number = Date.now()): ResumeLookup {
  if (typeof token !== 'string' || token.length !== 43) return { ok: false, reason: 'unknown' };
  const rec = byHash.get(hashOf(token));
  if (!rec) return { ok: false, reason: 'unknown' };
  if (rec.expiresAt !== null && now > rec.expiresAt) return { ok: false, reason: 'expired' };
  return { ok: true, bound: { session: rec.session, userId: rec.userId, nodeId: rec.nodeId } };
}

/** `null` while the session is attached; a timestamp while it is parked. */
export function setResumeExpiry(session: object, expiresAt: number | null): void {
  const rec = bySession.get(session);
  if (rec) rec.expiresAt = expiresAt;
}

export function revokeResumeToken(session: object): void {
  const rec = bySession.get(session);
  if (!rec) return;
  byHash.delete(rec.hash);
  bySession.delete(session);
}

export function _resetResumeTokensForTests(): void { byHash.clear(); }
