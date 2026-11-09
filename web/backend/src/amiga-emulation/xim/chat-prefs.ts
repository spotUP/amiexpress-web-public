/**
 * AEW_CHATPREFS (11300): a 68K door reads and writes the caller's LiveChat
 * prefs - the SAME per-user store the TS door uses (db.chatPrefs(), shown by
 * handleChatPrefs). One store, no second copy.
 *
 * Wire limits, measured: the request is one String of AE_MAX_LINE = 198 bytes
 * (ae_field_exchange clips it) and the reply is read back through the same
 * String, so it is at most 198 bytes too. All ten boolean keys at full length
 * come to 163 bytes, so a pinned list does not always fit beside them.
 *
 *   `GET`            -> `showLogins=1;showFileActivity=0;...;pinned=a,b` (only keys
 *                       the user stored; bools 0/1; pinned last, whole names only,
 *                       dropped to fit 198 bytes). Empty when the user has no prefs.
 *   `GET TAB pinned` -> the full pinned list `a,b,c` (up to 198 bytes, whole names).
 *   `SET TAB key TAB value` -> merges ONE key into the stored object (other keys,
 *                       known or not, are kept). Bools take `0`/`1`; pinnedChannels
 *                       takes a comma list. Answers `OK` or `NO` (unknown key, bad
 *                       value, over MAX_PREFS_BYTES, no signed-in user).
 *
 * Values are never logged. Text arrives latin1-decoded like every String request.
 */
import type { BBSSession } from '../../index';
import { db } from '../../database';
import { MAX_PREFS_BYTES } from '../../handlers/chat/prefs.handler';

export const CHAT_PREFS_REPLY_MAX = 198;

/** The boolean keys of the door's EventPrefs. */
export const CHAT_PREFS_BOOL_KEYS = [
  'showLogins', 'showFileActivity', 'showDoorActivity', 'showMessages', 'showSystemAnnouncements',
  'muteAllEvents', 'compactMode', 'showTimestamps', 'notificationSound', 'mentionSound',
] as const;
const PINNED_KEY = 'pinnedChannels';
const MAX_PINNED = 50;
const MAX_NAME = 64;

const clean = (s: string): string => s.replace(/[\x00-\x1f\x7f]/g, '').trim();

function pinnedOf(prefs: Record<string, unknown>): string[] {
  const pins = prefs[PINNED_KEY];
  return Array.isArray(pins) ? pins.filter((n): n is string => typeof n === 'string' && !!n && !n.includes(',')) : [];
}

/** Whole names joined by commas, at most `room` bytes. */
function fitNames(names: string[], room: number): string {
  let out = '';
  for (const n of names) {
    const next = out ? `${out},${n}` : n;
    if (next.length > room) break;
    out = next;
  }
  return out;
}

export function chatPrefsAnswer(request: string, session: BBSSession): string {
  const id = session.user?.id;
  if (id === undefined || id === null) return 'NO';
  const parts = request.split('\t');
  const repo = db.chatPrefs();
  const owner = String(id);

  if (parts[0] === 'GET') {
    const prefs = repo.get(owner);
    if (!prefs) return '';
    if (parts[1] === 'pinned') return fitNames(pinnedOf(prefs), CHAT_PREFS_REPLY_MAX);
    const fields: string[] = [];
    for (const k of CHAT_PREFS_BOOL_KEYS) if (typeof prefs[k] === 'boolean') fields.push(`${k}=${prefs[k] ? 1 : 0}`);
    let line = fields.join(';');
    const pinPrefix = line ? ';pinned=' : 'pinned=';
    const pins = fitNames(pinnedOf(prefs), CHAT_PREFS_REPLY_MAX - line.length - pinPrefix.length);
    if (pins) line += pinPrefix + pins;
    return line;
  }

  if (parts[0] === 'SET' && parts.length >= 3) {
    const key = clean(parts[1]);
    const value = clean(parts.slice(2).join(' '));
    const next: Record<string, unknown> = { ...(repo.get(owner) ?? {}) };
    if ((CHAT_PREFS_BOOL_KEYS as readonly string[]).includes(key)) {
      if (value !== '0' && value !== '1') return 'NO';
      next[key] = value === '1';
    } else if (key === PINNED_KEY) {
      const names = value ? value.split(',').map((n) => n.trim()).filter(Boolean) : [];
      if (names.length > MAX_PINNED || names.some((n) => n.length > MAX_NAME)) return 'NO';
      next[key] = names;
    } else {
      return 'NO';
    }
    if (JSON.stringify(next).length > MAX_PREFS_BYTES) return 'NO';
    repo.set(owner, next);
    return 'OK';
  }
  return 'NO';
}
