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

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface MessageFacts {
  body: string[];
  isPrivate?: boolean;
  parentId?: number | null;
  toUserIsSysop?: boolean;
}

interface ParentRow {
  author: string;
  timestamp: number;
  replies: number;
}

/** The parent of a reply: its author, its time, and how many replies it has now (this one included). */
function parentOf(rawDb: Database.Database | undefined, parentId: number): ParentRow | null {
  if (!rawDb) return null;
  const row = rawDb
    .prepare('SELECT author, timestamp, (SELECT COUNT(*) FROM messages r WHERE r.parentid = m.id) AS replies FROM messages m WHERE m.id = ?')
    .get(parentId) as ParentRow | undefined;
  return row ?? null;
}

function userByUsername(rawDb: Database.Database | undefined, username: string): { id: string; email: string | null } | null {
  if (!rawDb) return null;
  const row = rawDb.prepare('SELECT id, email FROM users WHERE username = ? COLLATE NOCASE').get(username) as { id: string; email: string | null } | undefined;
  return row ?? null;
}

/**
 * After saveMessage committed: msg.post keyed by the conference, and the
 * facts around it - a long message, the midnight window, a private one, a
 * reply (fast when under a minute), the parent's author's msg.thread on
 * the first reply, and msg.comment when the sysop is the recipient.
 */
export function reportMessage(session: ReporterSession, facts: MessageFacts, conferenceId: number, deps: SiteDeps = defaultSiteDeps): number {
  let n = 0;
  const bump = (r: string | null): void => { if (r) n += 1; };
  bump(report(session, 'msg.post', { key: `conf:${conferenceId}` }, deps.reporter));
  if (facts.body.length > 100) bump(report(session, 'msg.post', { key: 'lines:100+' }, deps.reporter));
  const midnight = midnightKey(deps);
  if (midnight) bump(report(session, 'msg.post', { key: midnight }, deps.reporter));
  if (facts.isPrivate) bump(report(session, 'msg.private', {}, deps.reporter));
  if (facts.toUserIsSysop) bump(report(session, 'msg.comment', {}, deps.reporter));
  if (facts.parentId) {
    const parent = parentOf(deps.rawDb(), facts.parentId);
    const fast = parent !== null && deps.now() / 1000 - parent.timestamp < 60;
    bump(report(session, 'msg.reply', fast ? { key: 'fast' } : {}, deps.reporter));
    if (parent && parent.replies === 1) {
      const author = userByUsername(deps.rawDb(), parent.author);
      if (author && author.email && String(author.id) !== String(session.user?.id ?? '')) {
        bump(report({ ...session, user: { id: author.id, email: author.email } }, 'msg.thread', { ref: `msg.thread:${facts.parentId}` }, deps.reporter));
      }
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export const RATIO_MIN_UPLOADS = 10;

/** The caller's counters as the row holds them now (after the upload's own update). */
function countersOf(rawDb: Database.Database | undefined, userId: string | number | undefined): { uploads: number; downloads: number } | null {
  if (!rawDb || userId === undefined) return null;
  const row = rawDb.prepare('SELECT uploads, downloads FROM users WHERE id = ?').get(String(userId)) as { uploads: number; downloads: number } | undefined;
  return row ?? null;
}

/**
 * After an upload was accepted: file.upload with its bytes, file.desc when
 * the caller wrote a real description (not one lifted from FILE_ID.DIZ),
 * and the ratio milestones - this board's definition: silver at one upload
 * per download, gold at two, both needing ten uploads, each once ever
 * (a deterministic ref the server dedups).
 */
export function reportUpload(session: ReporterSession, bytes: number, description: string, descriptionFromDiz: boolean, deps: SiteDeps = defaultSiteDeps): number {
  let n = 0;
  const bump = (r: string | null): void => { if (r) n += 1; };
  bump(report(session, 'file.upload', { value: Math.max(0, Math.floor(bytes)) }, deps.reporter));
  if (!descriptionFromDiz && description.trim().length >= 10) bump(report(session, 'file.desc', {}, deps.reporter));
  const c = countersOf(deps.rawDb(), session.user?.id ?? undefined);
  if (c && c.uploads >= RATIO_MIN_UPLOADS) {
    const email = (session.user?.email ?? '').toLowerCase();
    if (c.uploads >= c.downloads) bump(report(session, 'file.ratio', { key: 'silver', ref: `${email}:ratio:silver` }, deps.reporter));
    if (c.uploads >= 2 * c.downloads) bump(report(session, 'file.ratio', { key: 'gold', ref: `${email}:ratio:gold` }, deps.reporter));
  }
  return n;
}

export const OLD_FILE_YEARS = 25;

/** After a download: file.download with its bytes, keyed age:25y+ for a file uploaded that long ago. */
export function reportDownload(session: ReporterSession, file: { size?: number; uploadDate?: Date | string | number | null }, deps: SiteDeps = defaultSiteDeps): number {
  const uploaded = seconds(file.uploadDate);
  const old = uploaded !== null && deps.now() / 1000 - uploaded > OLD_FILE_YEARS * 365.25 * 24 * 3600;
  return report(session, 'file.download', { value: Math.max(0, Math.floor(file.size ?? 0)), ...(old ? { key: 'age:25y+' } : {}) }, deps.reporter) ? 1 : 0;
}
