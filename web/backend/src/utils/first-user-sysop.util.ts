/**
 * First install: the first registered caller becomes sysop, and only a caller
 * who holds the setup code may be that caller.
 *
 * A fresh board has no account at all (database.ts seeds none). At startup the
 * board counts level >= 200 users. With none, it raises firstUserIsSysop and
 * makes a one-time setup code, kept in memory only and printed in the server
 * log (console.warn: the log-level gate never silences it, so it shows in the
 * console and in `docker compose logs`). A restart makes a new code.
 *
 * While the flag is up, new-user registration first asks for that code
 * (new-user.handler.ts startNewUserRegistration), so a stranger who reaches
 * the board before the owner cannot register as sysop. The registration that
 * passes is promoted to level 255 by createAccountRecord, through
 * claimSysopPromotion, which lowers the flag and forgets the code: the second
 * caller is an ordinary user and never sees the setup prompt.
 */
import { randomBytes, timingSafeEqual } from 'crypto';

export interface FirstUserSysopDb {
  query(sql: string, params?: any[]): Promise<{ rows?: Array<{ count?: unknown }> }>;
}

// No 0/O or 1/I/L: the code is read off a log and typed by hand.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

let setupCode: string | null = null;

function makeSetupCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

/** What the caller typed, reduced to the code's own characters. */
function normaliseCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** The code as the log prints it and the caller types it: ABCD-EFGH. */
function displayCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export async function initFirstUserIsSysopFlag(db: FirstUserSysopDb): Promise<void> {
  try {
    const result = await db.query('SELECT COUNT(*) as count FROM users WHERE seclevel >= 200');
    const sysopCount = Number(result.rows?.[0]?.count ?? 0);
    if (sysopCount === 0) {
      (global as any).firstUserIsSysop = true;
      setupCode = makeSetupCode();
      console.warn(
        '\n[SETUP] ==========================================================\n' +
        '[SETUP] This board has no sysop yet.\n' +
        `[SETUP] Setup code: ${displayCode(setupCode)}\n` +
        '[SETUP] Connect (web, telnet or SSH), log in with the sysop name you\n' +
        '[SETUP] want, answer C to create the account and enter this code.\n' +
        '[SETUP] That account becomes the sysop (level 255).\n' +
        '[SETUP] ==========================================================\n'
      );
    } else {
      console.log(`[SETUP] Found ${sysopCount} sysop-level user(s)`);
      (global as any).firstUserIsSysop = false;
      setupCode = null;
    }
  } catch (err: any) {
    console.warn('[SETUP] Failed to check for sysop users:', err.message || err);
    (global as any).firstUserIsSysop = false;
    setupCode = null;
  }
}

/** True while the board has no sysop and registration needs the setup code. */
export function firstInstallPending(): boolean {
  return (global as any).firstUserIsSysop === true && setupCode !== null;
}

/** Whether what the caller typed is the setup code. Compared in constant time. */
export function setupCodeMatches(input: string): boolean {
  if (setupCode === null) return false;
  const typed = Buffer.from(normaliseCode(input));
  const wanted = Buffer.from(setupCode);
  return typed.length === wanted.length && timingSafeEqual(typed, wanted);
}

/**
 * The account being created takes the sysop level. True exactly once per
 * first install: it lowers the flag and forgets the code.
 */
export function claimSysopPromotion(): boolean {
  if ((global as any).firstUserIsSysop !== true) return false;
  (global as any).firstUserIsSysop = false;
  setupCode = null;
  return true;
}

/**
 * Shown above the logon name prompt while the board has no sysop, so the
 * owner learns what to do on every transport before logging in.
 */
export function firstInstallNotice(): string {
  if (!firstInstallPending()) return '';
  return '\r\n\x1b[1;33m[SETUP] This board has no sysop yet.\x1b[0m\r\n' +
    'Log in with the sysop name you want, answer C to create the account,\r\n' +
    'and enter the setup code printed in the server log.\r\n';
}
