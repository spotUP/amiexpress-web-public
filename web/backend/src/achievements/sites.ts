/**
 * The sites: what each BBS action reports, in one place each.
 *
 * A site is a one-line call beside the action, AFTER it committed, that
 * cannot throw (the reporter guarantees that). The facts a board computes
 * (S9) are computed here, never at the call site, so the two login paths,
 * the two upload paths and every door type say the same thing.
 */
import type Database from 'better-sqlite3';
import { db } from '../database';
import { hourKey, isMidnightWindow, isReturnAfter30, report, reportSnapshot, defaultDeps } from './reporter';
import type { ReporterDeps, ReporterSession } from './reporter';

/** The user record fields the presence facts read. All optional: a partial record reports what it can. */
export interface PresenceUser {
  id?: string | number;
  email?: string;
  calls?: number;
  messagesPosted?: number;
  uploads?: number;
  downloads?: number;
  timeTotal?: number;
  lastLogin?: Date | string | number | null;
  lastLoginBeforeUpdate?: Date | string | number | null;
  firstLogin?: Date | string | number | null;
}

export interface SiteDeps {
  reporter: ReporterDeps;
  rawDb: () => Database.Database | undefined;
  now: () => number;
}

export const defaultSiteDeps: SiteDeps = {
  reporter: defaultDeps,
  rawDb: () => (db as any).db as Database.Database | undefined,
  now: () => Date.now(),
};

const seconds = (d: Date | string | number | null | undefined): number | null => {
  if (d === null || d === undefined) return null;
  const t = d instanceof Date ? d.getTime() : typeof d === 'number' ? (d < 1e11 ? d * 1000 : d) : new Date(d).getTime();
  return Number.isFinite(t) && t > 0 ? Math.floor(t / 1000) : null;
};

/**
 * This caller's ordinal among the board's accounts, by first login - the
 * "thousandth caller" fact. Counted only on a first call; null when the
 * record has no first-login time.
 */
export function callerOrdinal(rawDb: Database.Database | undefined, user: PresenceUser): number | null {
  const first = seconds(user.firstLogin);
  if (!rawDb || first === null) return null;
  const row = rawDb.prepare('SELECT COUNT(*) AS n FROM users WHERE firstlogin <= ?').get(first) as { n: number };
  return row.n;
}

/**
 * At login: presence.call keyed by the hour, return:30 when the last call
 * is over thirty days old, caller:1000 on the thousandth account's first
 * call, the hardware fact, and the five snapshots out of the user record.
 * `user` is the record BEFORE this login's counters were bumped.
 */
export function reportPresence(session: ReporterSession, user: PresenceUser, deps: SiteDeps = defaultSiteDeps): number {
  const s: ReporterSession = { ...session, user: { id: user.id, email: user.email } };
  const now = deps.now();
  let n = 0;
  const bump = (r: string | null): void => { if (r) n += 1; };
  bump(report(s, 'presence.call', { key: hourKey(new Date(now)) }, deps.reporter));
  const last = user.lastLoginBeforeUpdate ?? user.lastLogin;
  if (isReturnAfter30(last, now)) bump(report(s, 'presence.call', { key: 'return:30' }, deps.reporter));
  if ((user.calls ?? 0) === 0 && callerOrdinal(deps.rawDb(), user) === 1000) {
    bump(report(s, 'presence.call', { key: 'caller:1000' }, deps.reporter));
  }
  if (session.terminalType === 'c64' || session.petsciiMode) bump(report(s, 'presence.client', { key: 'c64' }, deps.reporter));
  else if (session.isAmigaTerminal) bump(report(s, 'presence.client', { key: 'amiga' }, deps.reporter));
  bump(reportSnapshot(s, 'presence.call', (user.calls ?? 0) + 1, deps.reporter));
  bump(reportSnapshot(s, 'msg.post', user.messagesPosted ?? 0, deps.reporter));
  bump(reportSnapshot(s, 'file.upload', user.uploads ?? 0, deps.reporter));
  bump(reportSnapshot(s, 'file.download', user.downloads ?? 0, deps.reporter));
  return n;
}

/** At session end: the minutes-online snapshot, and the PETSCII session. */
export function reportLogout(session: ReporterSession, user: PresenceUser, durationSeconds: number | undefined, deps: SiteDeps = defaultSiteDeps): number {
  const s: ReporterSession = { ...session, user: { id: user.id, email: user.email } };
  let n = 0;
  const minutes = (user.timeTotal ?? 0) + Math.floor((durationSeconds ?? 0) / 60);
  if (reportSnapshot(s, 'presence.minutes', minutes, deps.reporter)) n += 1;
  if ((session.petsciiMode || session.terminalType === 'c64') && report(s, 'presence.petscii', {}, deps.reporter)) n += 1;
  return n;
}

/** Whether a message posted now earns the midnight key. */
export function midnightKey(deps: SiteDeps = defaultSiteDeps): string | null {
  return isMidnightWindow(new Date(deps.now())) ? 'midnight' : null;
}

/**
 * Around a door run, whatever its type or outcome: door.play at launch,
 * door.minutes when it is over (whole minutes, even when the door threw).
 */
export async function withDoorReporting<T>(session: ReporterSession, command: string, run: () => Promise<T>, deps: SiteDeps = defaultSiteDeps): Promise<T> {
  const started = deps.now();
  report(session, 'door.play', { key: command.toUpperCase(), door: command.toUpperCase() }, deps.reporter);
  try {
    return await run();
  } finally {
    const minutes = Math.floor((deps.now() - started) / 60000);
    report(session, 'door.minutes', { value: minutes, door: command.toUpperCase() }, deps.reporter);
  }
}
