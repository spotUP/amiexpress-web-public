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
interface Rec { hash: string; ref: WeakRefLike; userId: string; nodeId: number; expiresAt: number | null }

/**
 * The index holds the session WEAKLY. A strong reference here would pin every
 * web session (sockets, door state, emulator handles) until a revoke that not
 * every end path calls: a collected session simply answers 'unknown'. The
 * factory is a seam so a test can stand in for the collector.
 */
export interface WeakRefLike { deref(): object | undefined }
// The tsconfig lib predates ES2021; the Node runtime has WeakRef.
declare const WeakRef: new (target: object) => WeakRefLike;
let refFor: (session: object) => WeakRefLike = (s) => new WeakRef(s);
export function _setRefFactoryForTests(f: ((session: object) => WeakRefLike) | null): void {
  refFor = f ?? ((s) => new WeakRef(s));
}

const byHash = new Map<string, Rec>();
const bySession = new WeakMap<object, Rec>();

/** Records examined per issue/lookup: bounded work, round-robin over the Map. */
const SWEEP_PER_CALL = 32;
/** An idle board still cleans up: a full sweep this often (timer is unref'd). */
const SWEEP_INTERVAL_MS = 60_000;
let timer: NodeJS.Timeout | null = null;

const isDead = (rec: Rec, now: number) =>
  rec.ref.deref() === undefined || (rec.expiresAt !== null && now > rec.expiresAt);

/**
 * Drop records whose session was collected or whose window has passed.
 * Looks at the OLDEST `limit` entries; a live one is moved to the back so the
 * next call looks at different ones (round-robin), so every record is reached
 * within size/limit calls and no call walks the whole Map.
 */
function sweep(now: number, limit: number): void {
  let n = Math.min(limit, byHash.size);
  for (const [hash, rec] of byHash) {
    if (n-- <= 0) break;
    if (isDead(rec, now)) byHash.delete(hash);
    else { byHash.delete(hash); byHash.set(hash, rec); }
  }
}
/** Full sweep, run by the interval and exported for tests. */
export function sweepResumeTokens(now: number = Date.now()): void { sweep(now, byHash.size); }
export function resumeTokenCount(): number { return byHash.size; }

function ensureTimer(): void {
  if (timer) return;
  timer = setInterval(() => sweepResumeTokens(), SWEEP_INTERVAL_MS);
  timer.unref();
  // (unref: a sweep timer must never keep the process alive)
}
const hashOf = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

/** 8 hex chars of the hash: safe for logs, useless for opening anything. */
export function tokenFingerprint(token: string): string { return hashOf(token).slice(0, 8); }

/** Issue a token for a session, replacing any token it had. */
export function issueResumeToken(session: object, userId: string, nodeId: number): string {
  if (!Number.isInteger(nodeId) || nodeId < 1) throw new RangeError('resume token needs a real node id');
  revokeResumeToken(session);
  sweep(Date.now(), SWEEP_PER_CALL);
  ensureTimer();
  const token = crypto.randomBytes(32).toString('base64url');
  const rec: Rec = { hash: hashOf(token), ref: refFor(session), userId: String(userId), nodeId, expiresAt: null };
  byHash.set(rec.hash, rec);
  bySession.set(session, rec);
  return token;
}

/**
 * Lookup is by the sha256 of the offered token in a Map. The offered value is
 * hashed first, so what is compared is never the secret itself and the lookup
 * time does not depend on how many leading characters match.
 */
export function lookupResumeToken(token: unknown, now: number = Date.now()): ResumeLookup {
  // Answer first, sweep after: an expired token must say 'expired', not
  // 'unknown' because the sweep happened to reach its record first.
  const result = lookupOne(token, now);
  sweep(now, SWEEP_PER_CALL);
  return result;
}

function lookupOne(token: unknown, now: number): ResumeLookup {
  if (typeof token !== 'string' || token.length !== 43) return { ok: false, reason: 'unknown' };
  const hash = hashOf(token);
  const rec = byHash.get(hash);
  if (!rec) return { ok: false, reason: 'unknown' };
  const session = rec.ref.deref();
  if (session === undefined || rec.nodeId < 1) { byHash.delete(hash); return { ok: false, reason: 'unknown' }; }
  if (rec.expiresAt !== null && now > rec.expiresAt) return { ok: false, reason: 'expired' };
  return { ok: true, bound: { session, userId: rec.userId, nodeId: rec.nodeId } };
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

export function _resetResumeTokensForTests(): void {
  byHash.clear();
  if (timer) { clearInterval(timer); timer = null; }
}

/**
 * The one login-time entry: issue only for a real node, log only the
 * fingerprint. Returns undefined (and issues nothing) when no node is set.
 */
export function issueResumeTokenForLogin(session: { nodeId?: number }, userId: string): string | undefined {
  const nodeId = session.nodeId;
  if (typeof nodeId !== 'number' || !Number.isInteger(nodeId) || nodeId < 1) {
    console.log('[LOGIN] no resume token issued: the session has no node');
    return undefined;
  }
  const token = issueResumeToken(session, userId, nodeId);
  console.info(`[LOGIN] node ${nodeId}: resume token issued (fingerprint ${tokenFingerprint(token)})`);
  return token;
}
