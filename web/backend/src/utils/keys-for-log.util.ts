/**
 * What a log line may say about the keys a caller typed.
 *
 * handleCommand logged every keystroke verbatim, and the login is typed
 * through it one key at a time - so the live backend.log held callers'
 * passwords, a character per line, in the clear (found 2026-09-29 while
 * reading a login trace). Anything typed at the login or at a prompt that
 * asks for a password is logged as a count; everything else stays readable,
 * because a command letter in the log is how a menu bug gets diagnosed.
 */
import { BBSState } from '../constants/bbs-states';

/** Sub-states whose input is a secret: every password prompt, and auto-validation's. */
const SECRET_SUBSTATE = /password|autoval/i;

export function keysForLog(session: { state?: unknown; subState?: unknown } | null | undefined, data: string): string {
  const secret = session?.state === BBSState.LOGON
    || SECRET_SUBSTATE.test(String(session?.subState ?? ''));
  if (secret && data !== '' && data !== '\r' && data !== '\n') {
    return `<${data.length} key${data.length === 1 ? '' : 's'} hidden>`;
  }
  return JSON.stringify(data);
}
