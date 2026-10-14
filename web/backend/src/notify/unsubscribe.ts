/**
 * The unsubscribe link in every NOTIFY email.
 *
 * A JWT signed with jwtSecret(), claims { sub, evt, ch: 'email', pur:
 * 'notify-unsub' }, NO expiry (an old email's link must still work). Purpose
 * checked the way services/chat-token.service.ts marks its tokens (`chatOnly`):
 * the same secret signs login, chat and refresh tokens, so a token without
 * pur === 'notify-unsub' (a chat token, a session token) is refused, and an
 * unsubscribe token is useless anywhere else because it carries no userId /
 * secLevel claim the other verifiers read.
 *
 * evt is an event id (turns that event's Email cell off) or 'all' (pauses the
 * caller's notifications).
 */
import jwt from 'jsonwebtoken';
import type Database from 'better-sqlite3';
import { findEvent, normalizePrefs } from '@amiexpress/bbs-door-sdk/formats/notify';
import { jwtSecret } from '../utils/jwt-secrets';
import { getPrefs, getSettings, setPrefs, setSettings } from './repository';

export const UNSUBSCRIBE_PURPOSE = 'notify-unsub';
export const ALL_EVENTS = 'all';

export interface UnsubscribeClaims { userId: string; evt: string }

export function mintUnsubscribeToken(userId: string, evt: string): string {
  return jwt.sign({ sub: userId, evt, ch: 'email', pur: UNSUBSCRIBE_PURPOSE }, jwtSecret());
}

/** The claims, or null for anything that is not a valid unsubscribe token. */
export function verifyUnsubscribeToken(token: unknown): UnsubscribeClaims | null {
  if (typeof token !== 'string' || token === '') return null;
  try {
    const c = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] }) as Record<string, unknown>;
    if (c.pur !== UNSUBSCRIBE_PURPOSE || c.ch !== 'email') return null;
    if (typeof c.sub !== 'string' || c.sub === '' || typeof c.evt !== 'string' || c.evt === '') return null;
    if (c.evt !== ALL_EVENTS && !findEvent(c.evt) && !/^door\./.test(c.evt)) return null;
    return { userId: c.sub, evt: c.evt };
  } catch {
    return null;
  }
}

/** Apply a verified claim. Idempotent. */
export function applyUnsubscribe(db: Database.Database, claims: UnsubscribeClaims): void {
  if (claims.evt === ALL_EVENTS) {
    setSettings(db, claims.userId, { ...getSettings(db, claims.userId), paused: true });
    return;
  }
  const prefs = normalizePrefs(getPrefs(db, claims.userId));
  prefs[claims.evt] = { ...(prefs[claims.evt] ?? {}), email: 'off' };
  setPrefs(db, claims.userId, prefs);
}

export function unsubscribeUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/notify/unsubscribe?t=${encodeURIComponent(token)}`;
}
