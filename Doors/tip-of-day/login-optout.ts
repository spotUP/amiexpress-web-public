/**
 * A caller who does not want the tip at login.
 *
 * "a user just reported that he hates the tip door, he wants to turn it off"
 * (sysop, 2026-09-29). The board runs the tip at login from the MAILSCAN
 * screen as TIPLOGIN - the same door under a second registered command - and
 * a caller runs it himself as TIP. So the door knows which it is, and the
 * choice lives in the door's per-caller storage: no board special case.
 *
 *   at login, tips on   -> the tip, with N "never at login"
 *   at login, tips off  -> nothing at all
 *   typed TIP, tips on  -> the tip, with N "never at login"
 *   typed TIP, tips off -> the tip, with L "show at login again"
 */
export const LOGIN_COMMAND = 'TIPLOGIN';
export const SHOW_AT_LOGIN_KEY = 'show-at-login';

export interface Hint { key: string; does: string }

export interface LoginChoice {
  /** Draw the tip at all. */
  show: boolean;
  /** The keys the footer offers, the choice first. */
  hints: Hint[];
}

/** `stored` is what storage holds: null for a caller who never chose. */
export function loginChoice(launchedAs: string, stored: boolean | null): LoginChoice {
  const atLogin = launchedAs.trim().toUpperCase() === LOGIN_COMMAND;
  const on = stored !== false;
  if (atLogin && !on) return { show: false, hints: [] };
  const choice: Hint = on ? { key: 'N', does: 'never at login' } : { key: 'L', does: 'show at login again' };
  return { show: true, hints: [choice, { key: 'Any key', does: 'continues' }] };
}

/**
 * What a key press does to the choice: the new value to store, or undefined
 * for a key that only continues.
 */
export function answerKey(keyName: string, stored: boolean | null): boolean | undefined {
  const on = stored !== false;
  const k = keyName.toLowerCase();
  if (on && k === 'n') return false;
  if (!on && k === 'l') return true;
  return undefined;
}
