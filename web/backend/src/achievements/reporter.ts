/**
 * The ONE reporter. Every achievement event this board sends goes through
 * report() or reportSnapshot(); nothing else writes the outbox.
 *
 * Called AFTER the action committed, beside the webhook site and never
 * inside its try. Synchronous - one better-sqlite3 insert, microseconds -
 * and it never throws: any failure is one [WARN] line and a return. There
 * is nothing to await, so a reporter fault cannot reach BBS flow.
 *
 * A caller with no email is not a player (S1): the reporter returns without
 * writing. The ACHIEVE door asks for an address; this never prompts.
 *
 * Refs (S4): one-off events get `<board>:<random 26 chars>`; snapshots get
 * the contract's own `<board>:<email>:stat:<type>:<value>`, which is what
 * makes an unchanged counter a duplicate on the server.
 */
import * as crypto from 'crypto';
import type Database from 'better-sqlite3';
import { db } from '../database';
import { achievementsSettings } from './config';
import type { AchievementsSettings } from './config';
import { enqueue } from './outbox.repository';
import type { EventIn } from './contract';

/** What a site knows about the caller: the session, or the pieces of one. */
export interface ReporterSession {
  user?: { id?: string | number; email?: string } | null;
  connectionType?: string;
  terminalType?: string;
  isAmigaTerminal?: boolean;
  petsciiMode?: boolean;
}

export interface ReportOptions {
  key?: string | null;
  value?: number;
  door?: string | null;
  /** The event's own time; defaults to now. Epoch ms. */
  at?: number;
  /** A deterministic ref, for a fact that must count once ever (the server dedups refs). */
  ref?: string;
}

/** What report() needs from the world; tests hand it their own. */
export interface ReporterDeps {
  rawDb: () => Database.Database | undefined;
  settings: () => AchievementsSettings;
  now: () => number;
  warn: (line: string) => void;
}

const SETTINGS_TTL_MS = 30_000;
let cachedSettings: { at: number; value: AchievementsSettings } | null = null;

/** The board's settings, re-read from system_config at most every 30 s. */
export function currentSettings(): AchievementsSettings {
  const now = Date.now();
  if (cachedSettings && now - cachedSettings.at < SETTINGS_TTL_MS) return cachedSettings.value;
  let value: AchievementsSettings;
  try {
    // The achievements BOARD KEY is a secret: the admin writes it to the
    // ENCRYPTED system_config row (config-repository's encryptSecret) and
    // bbsConfig.info has no half of it at all. There are no two stores here
    // to disagree, which is the entire thing the rule guards against, and
    // reading the file would read a key that is not in it.
    // config-source-ok: a secret with no bbsConfig.info half.
    value = achievementsSettings((db as any).getConfigRepository?.()?.getSystemConfig?.() ?? null);
  } catch {
    value = achievementsSettings(null);
  }
  cachedSettings = { at: now, value };
  return value;
}

export function _resetSettingsCacheForTests(): void {
  cachedSettings = null;
}

export const defaultDeps: ReporterDeps = {
  rawDb: () => (db as any).db as Database.Database | undefined,
  settings: currentSettings,
  now: () => Date.now(),
  warn: (line) => console.warn(line),
};

const REF_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 26 characters of Crockford base32 from 130 random bits. Opaque to the server. */
export function newRef(boardId: string): string {
  const bytes = crypto.randomBytes(17);
  let out = '';
  let bits = 0;
  let acc = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5 && out.length < 26) {
      out += REF_ALPHABET[(acc >> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return `${boardId}:${out}`;
}

/** 'c64' from the PETSCII transport, 'amiga' from a telnet TTYPE that said so, else the connection type. */
export function clientOf(session: ReporterSession): string {
  if (session.terminalType === 'c64' || session.petsciiMode) return 'c64';
  if (session.isAmigaTerminal) return 'amiga';
  return session.connectionType ?? 'web';
}

/** True when the row is in the outbox (or already was). */
function write(deps: ReporterDeps, event: EventIn): boolean {
  const handle = deps.rawDb();
  if (!handle) {
    deps.warn('[WARN] achievements: no database handle; event dropped');
    return false;
  }
  enqueue(handle, event, Math.floor(deps.now() / 1000));
  return true;
}

/**
 * Report one event for the caller. Returns the ref written, or null when
 * nothing was (achievements off, no email, or a failure - the last of
 * which is one WARN line).
 */
export function report(session: ReporterSession, type: string, opts: ReportOptions = {}, deps: ReporterDeps = defaultDeps): string | null {
  try {
    const settings = deps.settings();
    if (!settings.enabled) return null;
    const email = (session.user?.email ?? '').trim();
    if (email === '') return null;
    const event: EventIn = {
      ref: opts.ref ? `${settings.boardId}:${opts.ref}` : newRef(settings.boardId),
      email,
      type,
      at: new Date(opts.at ?? deps.now()).toISOString(),
      ...(opts.value !== undefined ? { value: opts.value } : {}),
      ...(opts.key ? { key: opts.key } : {}),
      ...(opts.door ? { door: opts.door } : {}),
      client: clientOf(session),
    };
    return write(deps, event) ? event.ref : null;
  } catch (err) {
    deps.warn(`[WARN] achievements: report(${type}) failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Report an absolute counter out of the user record. The ref carries the
 * value, so re-sending an unchanged counter is a duplicate by construction.
 */
export function reportSnapshot(session: ReporterSession, name: string, value: number, deps: ReporterDeps = defaultDeps): string | null {
  try {
    const settings = deps.settings();
    if (!settings.enabled) return null;
    const email = (session.user?.email ?? '').trim();
    if (email === '' || !Number.isFinite(value)) return null;
    const event: EventIn = {
      ref: `${settings.boardId}:${email.toLowerCase()}:stat:${name}:${Math.floor(value)}`,
      email,
      type: 'stat.snapshot',
      at: new Date(deps.now()).toISOString(),
      key: name,
      value: Math.floor(value),
      client: clientOf(session),
    };
    return write(deps, event) ? event.ref : null;
  } catch (err) {
    deps.warn(`[WARN] achievements: snapshot(${name}) failed: ${(err as Error).message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// The facts a site computes. Pure, so a test can pin each edge.
// ---------------------------------------------------------------------------

/** `hour:HH` in the server's local time. */
export function hourKey(date: Date): string {
  return `hour:${String(date.getHours()).padStart(2, '0')}`;
}

/** 00:00 to 00:04 local: the five minutes the seed's rare.midnight names. */
export function isMidnightWindow(date: Date): boolean {
  return date.getHours() === 0 && date.getMinutes() < 5;
}

/** More than thirty days since the last call. A first call is not a return. */
export function isReturnAfter30(lastLogin: Date | string | number | null | undefined, now: number): boolean {
  if (lastLogin === null || lastLogin === undefined) return false;
  const t = lastLogin instanceof Date ? lastLogin.getTime() : new Date(lastLogin).getTime();
  if (!Number.isFinite(t) || t <= 0) return false;
  return now - t > 30 * 24 * 3600 * 1000;
}
