/**
 * Proving a caller owns the address their notification email goes to.
 *
 * users.email is typed once at registration and never confirmed, so NOTIFY
 * mails nothing until the caller has typed back a code sent to it:
 *
 *   startEmailVerification   six digits, mailed through the board's SMTP
 *                            (sendMailTo - not the achievements server),
 *                            valid fifteen minutes, one pending code per caller
 *   confirmEmail             five wrong guesses burn the code; success records
 *                            the address in notify_settings.email_verified
 *
 * The code is stored as an HMAC keyed by the JWT secret and bound to the user
 * and the address, so the table cannot be brute-forced offline and a code
 * mailed to one address cannot confirm another. (No shared hash helper exists
 * in src/: the createHash calls are file checksums, bcrypt is for passwords.)
 *
 * The door reaches these through the notifications API (N4).
 */
import * as crypto from 'crypto';
import type Database from 'better-sqlite3';
import { jwtSecret } from '../utils/jwt-secrets';
import { sendMailTo } from '../services/mail-notification.service';
import type { SendMailResult } from '../services/mail-notification.service';
import {
  accountEmail, bumpEmailAttempts, deleteEmailCode, getEmailCode, markEmailVerified, putEmailCode, sameAddress,
} from './repository';

export const CODE_TTL_SECONDS = 15 * 60;
export const CODE_MAX_ATTEMPTS = 5;
/** A code cannot be re-requested sooner than this: the endpoint must not be a mail cannon. */
export const CODE_RESEND_SECONDS = 60;

type Db = Database.Database;
type Mailer = (to: string, subject: string, text: string) => Promise<SendMailResult>;

export interface VerifyDeps {
  send: Mailer;
  /** Epoch seconds. */
  now: () => number;
  /** Six digits, zero padded. */
  makeCode: () => string;
  bbsName: () => Promise<string>;
}

export const productionVerifyDeps = (bbsName: () => Promise<string>): VerifyDeps => ({
  send: (to, subject, text) => sendMailTo(to, subject, text),
  now: () => Math.floor(Date.now() / 1000),
  makeCode: () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'),
  bbsName,
});

export function hashCode(userId: string, email: string, code: string): string {
  return crypto.createHmac('sha256', jwtSecret()).update(`${userId}\u0000${email.trim().toLowerCase()}\u0000${code}`).digest('hex');
}

export type StartResult =
  | { ok: true; email: string; expiresAt: number }
  | { ok: false; reason: 'no-address' | 'too-soon' | 'send-failed'; error?: string };

export async function startEmailVerification(db: Db, userId: string, deps: VerifyDeps): Promise<StartResult> {
  const email = accountEmail(db, userId);
  if (!email) return { ok: false, reason: 'no-address' };
  const now = deps.now();
  const pending = getEmailCode(db, userId);
  if (pending && sameAddress(pending.email, email) && now - (pending.expires_at - CODE_TTL_SECONDS) < CODE_RESEND_SECONDS) {
    return { ok: false, reason: 'too-soon' };
  }
  const code = deps.makeCode();
  const expiresAt = now + CODE_TTL_SECONDS;
  putEmailCode(db, userId, email, hashCode(userId, email, code), expiresAt);
  const sent = await deps.send(
    email,
    `${await deps.bbsName()}: your notification email code`,
    `Your code is ${code}\n\nType it into the Notifications door within 15 minutes to confirm this address.\n` +
      `If you did not ask for it, ignore this message.\n`,
  );
  if (!sent.ok) {
    deleteEmailCode(db, userId);
    return { ok: false, reason: 'send-failed', error: sent.error };
  }
  return { ok: true, email, expiresAt };
}

export type ConfirmResult =
  | { ok: true; email: string }
  | { ok: false; reason: 'none' | 'expired' | 'wrong' | 'locked' | 'changed'; attemptsLeft?: number };

export function confirmEmail(db: Db, userId: string, code: string, now: number): ConfirmResult {
  const row = getEmailCode(db, userId);
  if (!row) return { ok: false, reason: 'none' };
  if (now >= row.expires_at) { deleteEmailCode(db, userId); return { ok: false, reason: 'expired' }; }
  // The address changed since the code went out: the code vouches for the old one.
  if (!sameAddress(row.email, accountEmail(db, userId))) { deleteEmailCode(db, userId); return { ok: false, reason: 'changed' }; }

  const given = Buffer.from(hashCode(userId, row.email, code.trim()));
  const want = Buffer.from(row.code_hash);
  if (given.length === want.length && crypto.timingSafeEqual(given, want)) {
    markEmailVerified(db, userId, row.email, now);
    deleteEmailCode(db, userId);
    return { ok: true, email: row.email };
  }
  const used = bumpEmailAttempts(db, userId);
  if (used >= CODE_MAX_ATTEMPTS) { deleteEmailCode(db, userId); return { ok: false, reason: 'locked' }; }
  return { ok: false, reason: 'wrong', attemptsLeft: CODE_MAX_ATTEMPTS - used };
}
