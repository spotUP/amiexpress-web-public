/**
 * The resume token: what lets a tab whose socket dropped (a phone lock, a
 * network change, a laptop lid) rejoin the session the board parked for it.
 *
 * The board hands a token to its own tab in `login-success` and again in
 * every `session-restored` (it rotates on each resume). The browser keeps it
 * per tab and offers it on EVERY connect through socket.io's `auth` callback,
 * which socket.io-client evaluates afresh on each (re)connect, so the offer is
 * always the current token. The board alone decides whether it still opens
 * anything; the age kept here is housekeeping, never a validity check (the
 * two-minute limit that stood in BBSTerminal cut every resume after it).
 *
 * The token is a credential: nothing in this file logs it, and callers must
 * not either.
 */
import { reconnectPolicy, type ReconnectPolicy } from './reconnect-policy';

export interface ResumeEntry { token: string; userId: string; nodeId: number; savedAt: number }
export interface ResumeStorage {
  local: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  tab: Pick<Storage, 'getItem' | 'setItem'>;
}

/** localStorage: Record<tabId, ResumeEntry>. */
export const RESUME_KEY = 'bbs_resume_v1';
/** sessionStorage: which tab this is. */
export const TAB_ID_KEY = 'bbs_tab_id';
/** The longest default detach window plus a minute; only for pruning. */
export const RESUME_KEEP_MS = 11 * 60_000;
/**
 * A tab that lost its id may claim another entry only when that entry has
 * not been refreshed for this long: a live sibling tab refreshes its entry on
 * every login and resume, a parked one stops.
 */
export const CLAIM_MIN_AGE_MS = 5_000;

type Entries = Record<string, ResumeEntry>;

function isEntry(v: unknown): v is ResumeEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return typeof e.token === 'string' && e.token.length > 0
    && typeof e.userId === 'string'
    && typeof e.nodeId === 'number'
    && typeof e.savedAt === 'number' && Number.isFinite(e.savedAt);
}

function readAll(s: ResumeStorage): Entries {
  try {
    const raw = s.local.getItem(RESUME_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: Entries = {};
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (isEntry(v)) out[id] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(s: ResumeStorage, all: Entries): void {
  try {
    if (Object.keys(all).length === 0) s.local.removeItem(RESUME_KEY);
    else s.local.setItem(RESUME_KEY, JSON.stringify(all));
  } catch {
    // Storage full or blocked: the tab simply has nothing to offer.
  }
}

function prune(all: Entries, now: number): Entries {
  const out: Entries = {};
  for (const [id, e] of Object.entries(all)) {
    if (now - e.savedAt <= RESUME_KEEP_MS) out[id] = e;
  }
  return out;
}

function readTabId(s: ResumeStorage): string | null {
  try { return s.tab.getItem(TAB_ID_KEY); } catch { return null; }
}

function randomId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** This tab's id, minted and stored the first time it is asked for. */
export function tabId(s: ResumeStorage, newId: () => string = randomId): string {
  const existing = readTabId(s);
  if (existing) return existing;
  const id = newId();
  try { s.tab.setItem(TAB_ID_KEY, id); } catch { /* the id still serves this page load */ }
  return id;
}

/**
 * Keep the token the board just handed this tab. The same session saved under
 * another tab id (a tab that lost its id and claimed it) is taken over: one
 * session, one entry.
 */
export function saveResume(s: ResumeStorage, e: Omit<ResumeEntry, 'savedAt'>, now: number = Date.now()): void {
  const id = tabId(s);
  const all = prune(readAll(s), now);
  for (const [other, entry] of Object.entries(all)) {
    if (other !== id && entry.userId === e.userId && entry.nodeId === e.nodeId) delete all[other];
  }
  all[id] = { token: e.token, userId: e.userId, nodeId: e.nodeId, savedAt: now };
  writeAll(s, all);
}

/**
 * The token to offer on this connect: this tab's own. A tab with no id (its
 * sessionStorage was lost) offers the newest entry, but only once that entry
 * has gone quiet - a fresh one belongs to a sibling tab that is still live.
 */
export function resumeTokenToOffer(s: ResumeStorage, now: number = Date.now()): string | undefined {
  const all = prune(readAll(s), now);
  const id = readTabId(s);
  if (id) return all[id]?.token;
  let newest: ResumeEntry | undefined;
  for (const e of Object.values(all)) {
    if (!newest || e.savedAt > newest.savedAt) newest = e;
  }
  if (!newest || now - newest.savedAt < CLAIM_MIN_AGE_MS) return undefined;
  return newest.token;
}

/** Forget this tab's token; other tabs keep theirs. */
export function clearResume(s: ResumeStorage): void {
  const id = readTabId(s);
  if (!id) return;
  const all = readAll(s);
  if (!(id in all)) return;
  delete all[id];
  writeAll(s, all);
}

/** The browser's own storages, or undefined where there is no window. */
export function browserResumeStorage(): ResumeStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return { local: window.localStorage, tab: window.sessionStorage };
  } catch {
    return undefined;
  }
}

export type AuthCallback = (cb: (data: { resume?: string }) => void) => void;

export interface ConnectOptions extends ReconnectPolicy {
  transports: string[];
  timeout: number;
  upgrade: boolean;
  rememberUpgrade: boolean;
  auth: AuthCallback;
}

/**
 * socket.io-client options for the BBS socket. `auth` is a callback so it is
 * asked again on every reconnect and always carries the CURRENT token.
 * `handshake.auth.token` stays the admin/chat JWT; `resume` is its own key.
 */
export function connectOptions(isDevelopment: boolean, offer: () => string | undefined): ConnectOptions {
  return {
    // WebSocket first, polling as socket.io's own fallback.
    transports: ['websocket', 'polling'],
    timeout: 20000,
    upgrade: true,
    rememberUpgrade: true,
    // Retry until it works or the tab closes - see reconnect-policy.ts.
    ...reconnectPolicy(isDevelopment),
    auth: (cb) => {
      const token = offer();
      cb(token ? { resume: token } : {});
    },
  };
}

/** The line a tab prints when the board could not resume its session. */
export function resumeFailedText(reason: unknown): string {
  const r = typeof reason === 'object' && reason !== null
    ? (reason as { reason?: unknown }).reason
    : reason;
  if (r === 'expired') return 'Your previous session waited longer than the board allows. Please log in again.';
  if (r === 'account') return 'Your previous session could not be resumed for this account.';
  return 'Your previous session has ended (the board restarted or the call timed out). Please log in again.';
}
