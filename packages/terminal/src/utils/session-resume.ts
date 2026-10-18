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

/**
 * What a connect offers the board. `claim`: the token is not this tab's own
 * (a tab that lost its id, or whose id is not yet known to be its alone), so
 * the board may resume only a PARKED session with it, never take over a live
 * one (Decision 7).
 */
export interface ResumeOffer { resume: string; claim?: true }

/** localStorage: Record<tabId, ResumeEntry>. */
export const RESUME_KEY = 'bbs_resume_v1';
/** sessionStorage: which tab this is. */
export const TAB_ID_KEY = 'bbs_tab_id';
/**
 * sessionStorage: the tab id whose entry this tab offered last, so a refused
 * offer can be forgotten (never the token itself).
 */
export const OFFERED_KEY = 'bbs_resume_offered';
/** BroadcastChannel on which tabs ask who holds a tab id. */
export const TAB_CHANNEL_NAME = 'bbs_tab_id_v1';
/** How long a tab waits for another to say it holds the same id. */
export const TAB_ID_CHECK_MS = 300;
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
  if (typeof e.nodeId !== 'number' || !Number.isFinite(e.nodeId)) {
    // isEntry drops such an entry on read, so storing it would lose the resume in silence.
    console.warn('[resume] not saving the resume token: the board sent no numeric nodeId (got ' + String(e.nodeId) + ')');
    return;
  }
  const id = tabId(s);
  const all = prune(readAll(s), now);
  for (const [other, entry] of Object.entries(all)) {
    if (other !== id && entry.userId === e.userId && entry.nodeId === e.nodeId) delete all[other];
  }
  all[id] = { token: e.token, userId: e.userId, nodeId: e.nodeId, savedAt: now };
  writeAll(s, all);
}

type Picked = { offer: ResumeOffer; from: string };

/**
 * What to offer on this connect, and whose entry it is. A tab offers its own
 * entry; while its id is not yet confirmed as its alone (a duplicated tab
 * copies sessionStorage), that offer is a claim. A tab with no id (its
 * sessionStorage was lost) claims the newest entry, but only once that entry
 * has gone quiet - a fresh one belongs to a sibling tab that is still live.
 */
function pickOffer(s: ResumeStorage, now: number, idConfirmed: boolean): Picked | undefined {
  const all = prune(readAll(s), now);
  const id = readTabId(s);
  if (id) {
    const own = all[id];
    if (!own) return undefined;
    return { offer: idConfirmed ? { resume: own.token } : { resume: own.token, claim: true }, from: id };
  }
  let newest: [string, ResumeEntry] | undefined;
  for (const pair of Object.entries(all)) {
    if (!newest || pair[1].savedAt > newest[1].savedAt) newest = pair;
  }
  if (!newest || now - newest[1].savedAt < CLAIM_MIN_AGE_MS) return undefined;
  return { offer: { resume: newest[1].token, claim: true }, from: newest[0] };
}

/** The token this tab would offer now (no record kept). */
export function resumeTokenToOffer(s: ResumeStorage, now: number = Date.now()): string | undefined {
  return pickOffer(s, now, true)?.offer.resume;
}

/**
 * The offer for this connect, remembering whose entry it came from so a
 * refusal can forget that entry (`forgetRefusedOffer`).
 */
export function takeResumeOffer(s: ResumeStorage, idConfirmed: boolean = true, now: number = Date.now()): ResumeOffer | undefined {
  const picked = pickOffer(s, now, idConfirmed);
  try { s.tab.setItem(OFFERED_KEY, picked ? picked.from : ''); } catch { /* nothing to forget later */ }
  return picked?.offer;
}

function removeEntry(s: ResumeStorage, id: string): void {
  const all = readAll(s);
  if (!(id in all)) return;
  delete all[id];
  writeAll(s, all);
}

/** Forget this tab's token; other tabs keep theirs. */
export function clearResume(s: ResumeStorage): void {
  const id = readTabId(s);
  if (id) removeEntry(s, id);
}

/**
 * The board refused the last offer: forget the entry it came from, so the
 * next reconnect does not offer the same dead token again. `in-use` is the
 * one refusal that leaves the entry: it belongs to a tab that is still live.
 */
export function forgetRefusedOffer(s: ResumeStorage, refusal: unknown): void {
  if (refusalReason(refusal) === 'in-use') return;
  let from: string | null = null;
  try { from = s.tab.getItem(OFFERED_KEY); } catch { /* nothing recorded */ }
  if (from) removeEntry(s, from);
}

/** The one part of BroadcastChannel the tab id check uses. */
export interface TabIdChannel {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (ev: { data: unknown }) => void): void;
  close(): void;
}

export interface TabIdGuard {
  /** True once no other open tab has said it holds this tab's id. */
  confirmed(): boolean;
  close(): void;
}

type TabIdMessage = { type: 'who-holds' | 'held'; id: string; nonce: string };

function isTabIdMessage(v: unknown): v is TabIdMessage {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  return (m.type === 'who-holds' || m.type === 'held') && typeof m.id === 'string' && typeof m.nonce === 'string';
}

/**
 * Duplicate Tab and window.open copy sessionStorage, so a second tab can start
 * with the first one's id and the two would take the session from each other.
 * At startup a tab with an id asks the other tabs who holds it; an answer
 * means this tab is the copy, and it mints an id of its own. Until the wait
 * ends unanswered its offers are claims (the board then resumes only a parked
 * session). Every tab answers for its own id. Without BroadcastChannel the id
 * is taken as this tab's own, as before.
 */
export function guardTabId(
  s: ResumeStorage,
  channel: TabIdChannel | undefined,
  opts: { waitMs?: number; newId?: () => string; schedule?: (fn: () => void, ms: number) => unknown } = {},
): TabIdGuard {
  if (!channel) return { confirmed: () => true, close: () => {} };
  const newId = opts.newId ?? randomId;
  const schedule = opts.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const nonce = randomId();
  const asked = readTabId(s);
  let confirmed = asked === null;
  channel.addEventListener('message', (ev) => {
    const m = ev.data;
    if (!isTabIdMessage(m)) return;
    if (m.type === 'who-holds') {
      if (m.nonce !== nonce && m.id === readTabId(s)) channel.postMessage({ type: 'held', id: m.id, nonce: m.nonce });
    } else if (m.nonce === nonce && m.id === asked && readTabId(s) === asked) {
      try { s.tab.setItem(TAB_ID_KEY, newId()); } catch { /* keeps the copied id */ }
      confirmed = true;
    }
  });
  if (asked !== null) {
    channel.postMessage({ type: 'who-holds', id: asked, nonce });
    schedule(() => { confirmed = true; }, opts.waitMs ?? TAB_ID_CHECK_MS);
  }
  return { confirmed: () => confirmed, close: () => channel.close() };
}

/** The browser's BroadcastChannel for the tab id check, or undefined where there is none. */
export function browserTabChannel(): TabIdChannel | undefined {
  try {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    return new BroadcastChannel(TAB_CHANNEL_NAME);
  } catch {
    return undefined;
  }
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

export type AuthCallback = (cb: (data: Partial<ResumeOffer>) => void) => void;

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
export function connectOptions(isDevelopment: boolean, offer: () => ResumeOffer | undefined): ConnectOptions {
  return {
    // WebSocket first, polling as socket.io's own fallback.
    transports: ['websocket', 'polling'],
    timeout: 20000,
    upgrade: true,
    rememberUpgrade: true,
    // Retry until it works or the tab closes - see reconnect-policy.ts.
    ...reconnectPolicy(isDevelopment),
    auth: (cb) => {
      const o = offer();
      cb(o ? { ...o } : {});
    },
  };
}

/** The line a tab prints when the board could not resume its session. */
function refusalReason(reason: unknown): unknown {
  return typeof reason === 'object' && reason !== null
    ? (reason as { reason?: unknown }).reason
    : reason;
}

export function resumeFailedText(reason: unknown): string {
  const r = refusalReason(reason);
  if (r === 'in-use') return 'That session is still open in another window, so this window starts a new one.';
  if (r === 'expired') return 'Your previous session waited longer than the board allows. Please log in again.';
  if (r === 'account') return 'Your previous session could not be resumed for this account.';
  return 'Your previous session has ended (the board restarted or the call timed out). Please log in again.';
}
